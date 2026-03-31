// routes/appointmentRouter.js
import express from "express";
import { clerkMiddleware, requireAuth } from "@clerk/express";

import {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  getStats,
  getAppointmentsByPatient,
  getAppointmentsByDoctor,
  getRegisteredUserCount,
} from "../controllers/appointmentController.js";

const appointmentRouter = express.Router();

/* PUBLIC / FIXED ROUTES */
appointmentRouter.get("/", getAppointments);
appointmentRouter.get("/stats/summary", getStats);
appointmentRouter.get("/paitents/count", getRegisteredUserCount);

/* MUST BE BEFORE /:id */
appointmentRouter.get(
  "/me",
  clerkMiddleware(),
  requireAuth(),
  getAppointmentsByPatient
);

appointmentRouter.get("/doctor/:doctorId", getAppointmentsByDoctor);

/* AUTHENTICATED ROUTES */
appointmentRouter.post(
  "/",
  clerkMiddleware(),
  requireAuth(),
  createAppointment
);

/* ID ROUTES LAST */
appointmentRouter.get("/:id", getAppointmentById);
appointmentRouter.put("/:id", updateAppointment);
appointmentRouter.post("/:id/cancel", cancelAppointment);

export default appointmentRouter;