// controllers/serviceAppointmentController.js
import ServiceAppointment from "../models/serviceAppointment.js";
import Service from "../models/Service.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { getAuth } from "@clerk/express";

/* ── Razorpay init ──────────────────────────────────────────────────── */
const razorpayKeyId     = process.env.RAZORPAY_KEY_ID     || null;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || null;

const razorpay =
  razorpayKeyId && razorpayKeySecret
    ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
    : null;

/* ── Helpers ────────────────────────────────────────────────────────── */
const safeNumber = (val) => {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

function parseTimeString(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const t = timeStr.trim();
  const m = t.match(/([0-9]{1,2}):?([0-9]{0,2})\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let hh   = parseInt(m[1], 10);
  let mm   = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = (m[3] || "").toUpperCase();
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

  if (ampm) {
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
    return { hour: hh, minute: mm, ampm };
  }
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  if (hh === 0)  return { hour: 12, minute: mm, ampm: "AM" };
  if (hh === 12) return { hour: 12, minute: mm, ampm: "PM" };
  if (hh > 12)   return { hour: hh - 12, minute: mm, ampm: "PM" };
  return { hour: hh, minute: mm, ampm: "AM" };
}

function resolveClerkUserId(req) {
  try {
    const auth = req.auth || {};
    const candidate =
      auth?.userId || auth?.user_id || auth?.user?.id || req.user?.id || null;
    if (candidate) return candidate;
    try {
      const serverAuth = getAuth ? getAuth(req) : null;
      return serverAuth?.userId || null;
    } catch { return null; }
  } catch { return null; }
}

/* ── Verify Razorpay signature ──────────────────────────────────────── */
function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!razorpayKeySecret) return false;
  const body     = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(body)
    .digest("hex");
  return expected === signature;
}

/* ═══════════════════════════════════════════════════════════════════════
   CREATE RAZORPAY ORDER
   POST /api/payments/razorpay/create-order
═══════════════════════════════════════════════════════════════════════ */
export const createRazorpayOrder = async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: "Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      });
    }

    const { amount, serviceName, serviceId } = req.body || {};

    const numericAmount = safeNumber(amount);
    if (numericAmount === null || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount (in INR) is required." });
    }

    const options = {
      amount:   Math.round(numericAmount * 100), // INR → paise
      currency: "INR",
      receipt:  `rcpt_${Date.now()}`,
      notes: {
        serviceId:   String(serviceId   || ""),
        serviceName: String(serviceName || "").slice(0, 200),
      },
    };

    const order = await razorpay.orders.create(options);

    return res.status(201).json({
      success:  true,
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    razorpayKeyId,
    });
  } catch (err) {
    console.error("createRazorpayOrder error:", err);
    return res.status(502).json({
      success: false,
      message: err?.message || "Razorpay order creation failed.",
    });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   CREATE SERVICE APPOINTMENT
   POST /api/service-appointments
═══════════════════════════════════════════════════════════════════════ */
export const createServiceAppointment = async (req, res) => {
  try {
    const body        = req.body || {};
    const clerkUserId = resolveClerkUserId(req);
    if (!clerkUserId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to create a service appointment.",
      });
    }

    const {
      serviceId,
      serviceName:          serviceNameFromBody,
      patientName,
      mobile,
      age,
      gender,
      date,
      time,
      hour,
      minute,
      ampm,
      paymentMethod         = "Online",
      amount:               amountFromBody,
      fees:                 feesFromBody,
      fee:                  feeFromBody,
      email,
      meta                  = {},
      notes                 = "",
      serviceImageUrl:      serviceImageUrlFromBody,
      serviceImagePublicId: serviceImagePublicIdFromBody,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      paymentStatus,
    } = body;

    /* ── Validation ── */
    if (!serviceId)
      return res.status(400).json({ success: false, message: "serviceId is required" });
    if (!patientName || !String(patientName).trim())
      return res.status(400).json({ success: false, message: "patientName is required" });
    if (!mobile || !String(mobile).trim())
      return res.status(400).json({ success: false, message: "mobile is required" });
    if (!date || !String(date).trim())
      return res.status(400).json({ success: false, message: "date is required (YYYY-MM-DD)" });

    const numericAmount = safeNumber(amountFromBody ?? feesFromBody ?? feeFromBody ?? 0);
    if (numericAmount === null || numericAmount < 0)
      return res.status(400).json({ success: false, message: "amount/fees must be a valid number" });

    /* ── Parse time ── */
    let finalHour   = hour   !== undefined ? safeNumber(hour)   : null;
    let finalMinute = minute !== undefined ? safeNumber(minute) : null;
    let finalAmpm   = ampm   || null;

    if (time && (finalHour === null || finalHour === undefined)) {
      const parsed = parseTimeString(time);
      if (!parsed)
        return res.status(400).json({ success: false, message: "time string couldn't be parsed" });
      finalHour   = parsed.hour;
      finalMinute = parsed.minute;
      finalAmpm   = parsed.ampm;
    }

    if (
      finalHour === null ||
      finalMinute === null ||
      (finalAmpm !== "AM" && finalAmpm !== "PM")
    ) {
      return res.status(400).json({
        success: false,
        message: "Time missing or invalid — provide time string or hour, minute and ampm.",
      });
    }

    /* ── Duplicate booking check ── */
    try {
      const existing = await ServiceAppointment.findOne({
        serviceId: String(serviceId),
        createdBy: clerkUserId,
        date:      String(date),
        hour:      Number(finalHour),
        minute:    Number(finalMinute),
        ampm:      finalAmpm,
        status:    { $ne: "Canceled" },
      }).lean();
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "You already have a booking for this service at the selected date and time.",
        });
      }
    } catch (chkErr) {
      console.warn("Duplicate booking check failed:", chkErr);
    }

    /* ── Service snapshot ── */
    let svc = null;
    try { svc = await Service.findById(serviceId).lean(); } catch (e) {
      console.warn("Service lookup failed:", e?.message || e);
    }

    const resolvedServiceName =
      serviceNameFromBody || (svc && (svc.name || svc.title)) || "Service";

    const svcImageUrlFromDB =
      svc && String(svc.imageUrl || svc.image || svc.image?.url || "").trim();
    const svcImagePublicIdFromDB =
      svc && String(svc.imagePublicId || svc.image?.publicId || "").trim();

    const finalServiceImageUrl =
      svcImageUrlFromDB?.length
        ? svcImageUrlFromDB
        : String(serviceImageUrlFromBody || "").trim();
    const finalServiceImagePublicId =
      svcImagePublicIdFromDB?.length
        ? svcImagePublicIdFromDB
        : String(serviceImagePublicIdFromBody || "").trim();

    /* ── Base document ── */
    const base = {
      serviceId,
      serviceName:  resolvedServiceName,
      serviceImage: { url: finalServiceImageUrl, publicId: finalServiceImagePublicId },
      patientName:  String(patientName).trim(),
      mobile:       String(mobile).trim(),
      age:          age ? Number(age) : undefined,
      gender:       gender || "",
      date:         String(date),
      hour:         Number(finalHour),
      minute:       Number(finalMinute),
      ampm:         finalAmpm,
      fees:         numericAmount,
      createdBy:    clerkUserId,
      notes:        notes || "",
    };

    /* ── Free appointment ── */
    if (numericAmount === 0) {
      const created = await ServiceAppointment.create({
        ...base,
        status:  "Pending",
        payment: { method: "Cash", status: "Pending", amount: 0, paidAt: new Date() },
      });
      return res.status(201).json({ success: true, appointment: created });
    }

    /* ── Cash booking ── */
    if (paymentMethod === "Cash") {
      const created = await ServiceAppointment.create({
        ...base,
        status:  "Pending",
        payment: { method: "Cash", status: "Pending", amount: numericAmount, meta },
      });
      return res.status(201).json({ success: true, appointment: created });
    }

    /* ── Online booking via Razorpay ── */
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: "Razorpay not configured on server.",
      });
    }

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "razorpayPaymentId, razorpayOrderId and razorpaySignature are required for Online payment.",
      });
    }

    const isValid = verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Razorpay payment signature verification failed.",
      });
    }

    /* ── Save confirmed appointment ── */
    try {
      const created = await ServiceAppointment.create({
        ...base,
        status: "Confirmed",
        payment: {
          method:     "Online",
          status:     "Paid",         // ✅ fixed: was "Confirmed"
          amount:     numericAmount,
          providerId: razorpayPaymentId,
          paidAt:     new Date(),
          meta,
        },
      });
      return res.status(201).json({ success: true, appointment: created });
    } catch (dbErr) {
      console.error("DB error saving service appointment after Razorpay payment:", dbErr);
      return res.status(500).json({ success: false, message: "Failed to create appointment record." });
    }
  } catch (err) {
    console.error("createServiceAppointment unexpected:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   RAZORPAY WEBHOOK
   POST /api/payments/razorpay/webhook
═══════════════════════════════════════════════════════════════════════ */
export const razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(500).json({ success: false, message: "Webhook secret not configured." });
    }

    const signature = req.headers["x-razorpay-signature"];
    const body      = JSON.stringify(req.body);

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature." });
    }

    const event = req.body;

    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      if (payment?.id) {
        await ServiceAppointment.findOneAndUpdate(
          { "payment.providerId": payment.id },
          {
            $set: {
              "payment.status": "Paid",         // ✅ fixed: was "Confirmed"
              "payment.paidAt": new Date(),
              status:           "Confirmed",
            },
          },
        );
      }
    }

    if (event.event === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) {
        await ServiceAppointment.findOneAndUpdate(
          { "payment.orderId": payment.order_id },
          { $set: { "payment.status": "Failed", status: "Canceled" } },
        );
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("razorpayWebhook error:", err);
    return res.status(500).json({ success: false, message: "Webhook processing failed." });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   GET LIST
═══════════════════════════════════════════════════════════════════════ */
export const getServiceAppointments = async (req, res) => {
  try {
    const {
      serviceId,
      mobile,
      status,
      page:  pageRaw  = 1,
      limit: limitRaw = 50,
      search = "",
    } = req.query;

    const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
    const page  = Math.max(1, parseInt(pageRaw,  10) || 1);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (serviceId) filter.serviceId = serviceId;
    if (mobile)    filter.mobile    = mobile;
    if (status)    filter.status    = status;
    if (search) {
      const re = new RegExp(search, "i");
      filter.$or = [{ patientName: re }, { mobile: re }, { notes: re }];
    }

    const appointments = await ServiceAppointment.find(filter)
      .populate("serviceId", "name image imageUrl imageSmall")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ServiceAppointment.countDocuments(filter);

    return res.json({
      success: true,
      appointments,
      meta: { page, limit, total, count: appointments.length },
    });
  } catch (err) {
    console.error("getServiceAppointments:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   GET BY ID
═══════════════════════════════════════════════════════════════════════ */
export const getServiceAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const appt   = await ServiceAppointment.findById(id).lean();
    if (!appt) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: appt });
  } catch (err) {
    console.error("getServiceAppointmentById:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   UPDATE
═══════════════════════════════════════════════════════════════════════ */
export const updateServiceAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const body   = req.body || {};
    const updates = {};

    if (body.status              !== undefined) updates.status              = body.status;
    if (body.notes               !== undefined) updates.notes               = body.notes;
    if (body.payment             !== undefined) updates.payment             = body.payment;
    if (body["payment.status"]   !== undefined) updates["payment.status"]   = body["payment.status"];

    if (body.rescheduledTo) {
      const { date, time } = body.rescheduledTo || {};
      updates.rescheduledTo = {};
      if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
          return res.status(400).json({ success: false, message: "rescheduledTo.date must be YYYY-MM-DD" });
        updates.rescheduledTo.date = date;
        updates.date               = date;
      }
      if (time) {
        updates.rescheduledTo.time = String(time);
        const parsed = parseTimeString(String(time));
        if (!parsed)
          return res.status(400).json({ success: false, message: "rescheduledTo.time couldn't be parsed" });
        updates.hour   = parsed.hour;
        updates.minute = parsed.minute;
        updates.ampm   = parsed.ampm;
        updates.time   = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")} ${parsed.ampm}`;
      }
      if (!body.status) updates.status = "Rescheduled";
    }

    if (updates.payment) {
      const method = updates.payment.method;
      if (method && String(method).toLowerCase() === "online")
        updates.status = updates.status || "Confirmed";
      if (updates.payment.status === "Paid") {   // ✅ fixed: was "Confirmed"
        updates.status = "Confirmed";
        if (updates.payment.paidAt === undefined) updates.payment.paidAt = new Date();
      }
    }

    const updated = await ServiceAppointment.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );
    if (!updated) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("updateServiceAppointment:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   CANCEL
═══════════════════════════════════════════════════════════════════════ */
export const cancelServiceAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appt   = await ServiceAppointment.findById(id);
    if (!appt) return res.status(404).json({ success: false, message: "Not found" });
    if (appt.status === "Completed")
      return res.status(400).json({ success: false, message: "Cannot cancel a completed appointment" });

    appt.status = "Canceled";
    if (appt.payment)
      appt.payment.status = appt.payment.status === "Paid" ? "Refunded" : "Pending"; // ✅ fixed
    await appt.save();
    return res.json({ success: true, data: appt });
  } catch (err) {
    console.error("cancelServiceAppointment:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════════════════════ */
export const getServiceAppointmentStats = async (req, res) => {
  try {
    const services = await Service.aggregate([
      {
        $lookup: {
          from:         "serviceappointments",
          localField:   "_id",
          foreignField: "serviceId",
          as:           "appointments",
        },
      },
      {
        $addFields: {
          totalAppointments: { $size: "$appointments" },
          completed: {
            $size: {
              $filter: {
                input: "$appointments",
                as:    "a",
                cond:  { $eq: ["$$a.status", "Completed"] },
              },
            },
          },
          canceled: {
            $size: {
              $filter: {
                input: "$appointments",
                as:    "a",
                cond:  { $eq: ["$$a.status", "Canceled"] },
              },
            },
          },
        },
      },
      { $addFields: { earning: { $multiply: ["$completed", "$price"] } } },
      {
        $project: {
          name:              1,
          price:             1,
          image:             "$imageUrl",
          totalAppointments: 1,
          completed:         1,
          canceled:          1,
          earning:           1,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.json({ success: true, services, totalServices: services.length });
  } catch (err) {
    console.error("getServiceAppointmentStats:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   GET BY PATIENT (/me)
═══════════════════════════════════════════════════════════════════════ */
export const getServiceAppointmentsByPatient = async (req, res) => {
  try {
    const clerkUserId           = resolveClerkUserId(req);
    const { createdBy, mobile } = req.query;
    const resolvedCreatedBy     = createdBy || clerkUserId || null;
    if (!resolvedCreatedBy && !mobile)
      return res.json({ success: true, data: [] });

    const filter = {};
    if (resolvedCreatedBy) filter.createdBy = resolvedCreatedBy;
    if (mobile)            filter.mobile    = mobile;

    const list = await ServiceAppointment.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("getServiceAppointmentsByPatient:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export default {
  createRazorpayOrder,
  razorpayWebhook,
  createServiceAppointment,
  getServiceAppointments,
  getServiceAppointmentById,
  updateServiceAppointment,
  cancelServiceAppointment,
  getServiceAppointmentStats,
  getServiceAppointmentsByPatient,
};