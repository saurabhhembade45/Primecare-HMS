// routes/paymentRouter.js
import express from "express";
import { requireAuth } from "@clerk/express";
import {
  createRazorpayOrder,
  razorpayWebhook,
} from "../controllers/appointmentController.js";

const router = express.Router();

router.post("/razorpay/create-order", requireAuth(), createRazorpayOrder);

router.post(
  "/razorpay/webhook",
  express.raw({ type: "application/json" }),
  razorpayWebhook
);

export default router;