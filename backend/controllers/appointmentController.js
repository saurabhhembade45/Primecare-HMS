// controllers/appointmentController.js
import Razorpay from "razorpay";
import crypto from "crypto";
import Appointment from "../models/Appointment.js";
import Doctor from "../models/Doctor.js";
import dotenv from "dotenv";
import { getAuth } from "@clerk/express";
import { clerkClient } from "@clerk/clerk-sdk-node";
dotenv.config();

const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID     || null;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || null;
const FRONTEND_URL        = process.env.FRONTEND_URL;
const MAJOR_ADMIN_ID      = process.env.MAJOR_ADMIN_ID || null;

const razorpay =
  RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
    ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
    : null;

/* ── Helpers ────────────────────────────────────────────────────────── */
const safeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function resolveClerkUserId(req) {
  try {
    const auth      = req.auth || {};
    const fromReq   = auth?.userId || auth?.user_id || auth?.user?.id || req.user?.id || null;
    if (fromReq) return fromReq;
    try {
      const serverAuth = getAuth ? getAuth(req) : null;
      return serverAuth?.userId || null;
    } catch { return null; }
  } catch { return null; }
}

/* ── Verify Razorpay signature ──────────────────────────────────────── */
function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

/* ═══════════════════════════════════════════════════════════════════════
   CREATE RAZORPAY ORDER
   POST /api/payments/razorpay/create-order
   Body: { amount (INR), doctorName, doctorId }
   Returns: { orderId, amount (paise), currency, keyId }
═══════════════════════════════════════════════════════════════════════ */
export const createRazorpayOrder = async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: "Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      });
    }

    const { amount, doctorName, doctorId } = req.body || {};

    const numericAmount = safeNumber(amount);
    if (numericAmount === null || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount (in INR) is required." });
    }

    const order = await razorpay.orders.create({
      amount:   Math.round(numericAmount * 100), // INR → paise
      currency: "INR",
      receipt:  `rcpt_appt_${Date.now()}`,
      notes: {
        doctorId:   String(doctorId   || ""),
        doctorName: String(doctorName || "").slice(0, 200),
      },
    });

    return res.status(201).json({
      success:  true,
      orderId:  order.id,
      amount:   order.amount,   // paise
      currency: order.currency,
      keyId:    RAZORPAY_KEY_ID,
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
   RAZORPAY WEBHOOK  (optional but recommended)
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
    const expected  = crypto
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
        await Appointment.findOneAndUpdate(
          { "payment.providerId": payment.id },
          {
            $set: {
              "payment.status": "Paid",
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
        await Appointment.findOneAndUpdate(
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
   LIST / SINGLE / BY-PATIENT  (unchanged)
═══════════════════════════════════════════════════════════════════════ */
export const getAppointments = async (req, res) => {
  try {
    const {
      doctorId, mobile, status, search = "",
      limit: limitRaw = 50, page: pageRaw = 1,
      patientClerkId, createdBy,
    } = req.query;

    const limit  = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
    const page   = Math.max(1, parseInt(pageRaw,  10) || 1);
    const skip   = (page - 1) * limit;
    const filter = {};

    if (doctorId)        filter.doctorId  = doctorId;
    if (mobile)          filter.mobile    = mobile;
    if (status)          filter.status    = status;
    if (patientClerkId)  filter.createdBy = patientClerkId;
    if (createdBy)       filter.createdBy = createdBy;
    if (search) {
      const re = new RegExp(search, "i");
      filter.$or = [{ patientName: re }, { mobile: re }, { notes: re }];
    }

    const items = await Appointment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("doctorId", "name specialization owner imageUrl image")
      .lean();

    const total = await Appointment.countDocuments(filter);
    return res.json({ success: true, appointments: items, meta: { page, limit, total, count: items.length } });
  } catch (err) {
    console.error("getAppointments:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const appt   = await Appointment.findById(id)
      .populate("doctorId", "name specialization owner imageUrl image")
      .lean();
    if (!appt) return res.status(404).json({ success: false, message: "Appointment not found" });
    return res.json({ success: true, appointment: appt });
  } catch (err) {
    console.error("getAppointmentById:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAppointmentsByPatient = async (req, res) => {
  try {
    const queryCreatedBy    = req.query.createdBy || null;
    const clerkUserId       = req.auth?.userId    || null;
    const resolvedCreatedBy = queryCreatedBy || clerkUserId || null;

    console.log("resolvedCreatedBy:", resolvedCreatedBy);

    if (!resolvedCreatedBy && !req.query.mobile) {
      return res.status(401).json({
        success: false,
        message: "Authentication required for /me. Try passing ?createdBy=<id> to debug.",
      });
    }

    const filter = {};
    if (resolvedCreatedBy) filter.createdBy = resolvedCreatedBy;
    if (req.query.mobile)  filter.mobile    = req.query.mobile;

    const appointments = await Appointment.find(filter).sort({ date: 1, time: 1 }).lean();
    return res.json({ success: true, appointments });
  } catch (err) {
    console.error("getAppointmentsByPatient:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   CREATE APPOINTMENT
   POST /api/appointments
   Online: expects razorpayPaymentId, razorpayOrderId, razorpaySignature
   Cash:   saves directly as Pending
═══════════════════════════════════════════════════════════════════════ */
export const createAppointment = async (req, res) => {
  try {
    const {
      doctorId,
      patientName,
      mobile,
      age                   = "",
      gender                = "",
      date,
      time,
      fee,
      fees,
      notes                 = "",
      email,
      paymentMethod,
      owner:                ownerFromBody        = null,
      doctorName:           doctorNameFromBody,
      speciality:           specialityFromBody,
      doctorImageUrl:       doctorImageUrlFromBody,
      doctorImagePublicId:  doctorImagePublicIdFromBody,
      // Razorpay payment proof
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = req.body || {};

    const clerkUserId = resolveClerkUserId(req);
    if (!clerkUserId) {
      return res.status(401).json({ success: false, message: "Authentication required (Clerk)" });
    }

    if (!doctorId || !patientName || !mobile || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "doctorId, patientName, mobile, date and time are required",
      });
    }

    const numericFee = safeNumber(fee ?? fees ?? 0);
    if (numericFee === null || numericFee < 0) {
      return res.status(400).json({ success: false, message: "fee must be a valid number" });
    }

    /* ── Duplicate booking check ── */
    const existingBooking = await Appointment.findOne({
      doctorId,
      createdBy: clerkUserId,
      date:      String(date),
      time:      String(time),
      status:    { $ne: "Canceled" },
    }).lean();

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "You already have an appointment with this doctor at the selected date and time.",
      });
    }

    /* ── Doctor lookup ── */
    let doctor = null;
    try { doctor = await Doctor.findById(doctorId).lean(); } catch (e) {
      console.warn("Doctor lookup failed:", e?.message || e);
    }
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    let resolvedOwner = ownerFromBody || doctor.owner || MAJOR_ADMIN_ID || String(doctorId);

    const doctorName =
      (doctor.name        && String(doctor.name).trim()) ||
      (doctorNameFromBody && String(doctorNameFromBody).trim()) || "";

    const speciality =
      (doctor.specialization && String(doctor.specialization).trim()) ||
      (doctor.speciality     && String(doctor.speciality).trim())     ||
      (specialityFromBody    && String(specialityFromBody).trim())    || "";

    const doctorImageUrl =
      (doctor.imageUrl                                 && String(doctor.imageUrl).trim())                                 ||
      (doctor.image                                    && String(doctor.image).trim())                                    ||
      (doctor.avatarUrl                                && String(doctor.avatarUrl).trim())                                ||
      (doctor.profileImage?.url                        && String(doctor.profileImage.url).trim())                        ||
      (doctorImageUrlFromBody                          && String(doctorImageUrlFromBody).trim())                          || "";

    const doctorImagePublicId =
      (doctor.imagePublicId        && String(doctor.imagePublicId).trim())        ||
      (doctor.profileImage?.publicId && String(doctor.profileImage.publicId).trim()) ||
      (doctorImagePublicIdFromBody && String(doctorImagePublicIdFromBody).trim()) || "";

    const base = {
      doctorId:    String(doctor._id || doctorId),
      doctorName,
      speciality,
      doctorImage: { url: doctorImageUrl, publicId: doctorImagePublicId },
      patientName: String(patientName).trim(),
      mobile:      String(mobile).trim(),
      age:         age    ? Number(age)    : undefined,
      gender:      gender ? String(gender) : "",
      date:        String(date),
      time:        String(time),
      fees:        numericFee,
      status:      "Pending",
      payment:     { method: paymentMethod === "Cash" ? "Cash" : "Online", status: "Pending", amount: numericFee },
      notes:       notes || "",
      createdBy:   clerkUserId,
      owner:       resolvedOwner,
    };

    /* ── Free appointment ── */
    if (numericFee === 0) {
      const created = await Appointment.create({
        ...base,
        status:  "Confirmed",
        payment: { method: base.payment.method, status: "Paid", amount: 0 },
        paidAt:  new Date(),
      });
      return res.status(201).json({ success: true, appointment: created });
    }

    /* ── Cash payment ── */
    if (paymentMethod === "Cash") {
      const created = await Appointment.create({
        ...base,
        status:  "Pending",
        payment: { method: "Cash", status: "Pending", amount: numericFee },
      });
      return res.status(201).json({ success: true, appointment: created });
    }

    /* ── Online payment via Razorpay ── */
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: "Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      });
    }

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "razorpayPaymentId, razorpayOrderId and razorpaySignature are required for Online payment.",
      });
    }

    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Razorpay payment signature verification failed. Payment may be tampered.",
      });
    }

    /* ── Save confirmed appointment ── */
    try {
      const created = await Appointment.create({
        ...base,
        status: "Confirmed",
        payment: {
          method:     "Online",
          status:     "Paid",
          amount:     numericFee,
          providerId: razorpayPaymentId,
          orderId:    razorpayOrderId,
          paidAt:     new Date(),
        },
        paidAt: new Date(),
      });
      return res.status(201).json({ success: true, appointment: created });
    } catch (dbErr) {
      console.error("DB error saving appointment after Razorpay payment:", dbErr);
      return res.status(500).json({ success: false, message: "Failed to create appointment record." });
    }
  } catch (err) {
    console.error("createAppointment unexpected:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   REMAINING CONTROLLERS (unchanged)
═══════════════════════════════════════════════════════════════════════ */
export const updateAppointment = async (req, res) => {
  try {
    const { id }  = req.params;
    const body    = req.body || {};
    const appt    = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ success: false, message: "Appointment not found" });

    const terminal = appt.status === "Completed" || appt.status === "Canceled";
    if (terminal && body.status && body.status !== appt.status) {
      return res.status(400).json({ success: false, message: "Cannot change status of a completed/canceled appointment" });
    }

    const update = {};
    if (body.status)           update.status = body.status;
    if (body.notes !== undefined) update.notes = body.notes;

    if (body.date && body.time) {
      if (terminal) {
        return res.status(400).json({ success: false, message: "Cannot reschedule completed/canceled appointment" });
      }
      update.date          = body.date;
      update.time          = body.time;
      update.status        = "Rescheduled";
      update.rescheduledTo = { date: body.date, time: body.time };
    }

    const updated = await Appointment.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .populate({ path: "doctorId", select: "name imageUrl" })
      .lean();

    return res.json({ success: true, appointment: updated });
  } catch (err) {
    console.error("updateAppointment:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appt   = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ success: false, message: "Appointment not found" });
    appt.status = "Canceled";
    await appt.save();
    return res.json({ success: true, appointment: appt });
  } catch (err) {
    console.error("cancelAppointment:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getStats = async (req, res) => {
  try {
    const total   = await Appointment.countDocuments();
    const paidAgg = await Appointment.aggregate([
      { $match: { "payment.status": "Paid" } },
      { $group: { _id: null, total: { $sum: "$fees" } } },
    ]);
    const revenue     = (paidAgg[0] && paidAgg[0].total) || 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recent = await Appointment.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    return res.json({ success: true, stats: { total, revenue, recentLast7Days: recent } });
  } catch (err) {
    console.error("getStats:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAppointmentsByDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!doctorId) return res.status(400).json({ success: false, message: "doctorId required" });

    const { mobile, status, search = "", limit: limitRaw = 50, page: pageRaw = 1 } = req.query;
    const limit  = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50));
    const page   = Math.max(1, parseInt(pageRaw,  10) || 1);
    const skip   = (page - 1) * limit;
    const filter = { doctorId };

    if (mobile) filter.mobile = mobile;
    if (status) filter.status = status;
    if (search) {
      const re = new RegExp(search, "i");
      filter.$or = [{ patientName: re }, { mobile: re }, { notes: re }];
    }

    const items = await Appointment.find(filter)
      .sort({ date: 1, time: 1 })
      .skip(skip)
      .limit(limit)
      .populate("doctorId", "name specialization owner imageUrl image")
      .lean();

    const total = await Appointment.countDocuments(filter);
    return res.json({ success: true, appointments: items, meta: { page, limit, total, count: items.length } });
  } catch (err) {
    console.error("getAppointmentsByDoctor:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export async function getRegisteredUserCount(req, res) {
  try {
    const totalUsers = await clerkClient.users.getCount();
    return res.json({ success: true, totalUsers });
  } catch (err) {
    console.error("getRegisteredUserCount error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

export default {
  createRazorpayOrder,
  razorpayWebhook,
  getAppointments,
  getAppointmentById,
  getAppointmentsByPatient,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  getStats,
  getAppointmentsByDoctor,
  getRegisteredUserCount,
};