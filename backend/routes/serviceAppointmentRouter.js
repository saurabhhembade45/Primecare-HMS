// routes/serviceAppointmentRouter.js
import express from "express";
import { clerkMiddleware, requireAuth } from "@clerk/express";

import {
  getServiceAppointments,
  getServiceAppointmentById,
  createServiceAppointment,
  updateServiceAppointment,
  cancelServiceAppointment,
  getServiceAppointmentStats,
  getServiceAppointmentsByPatient,
} from "../controllers/serviceAppointmentController.js";

const router = express.Router();

// Apply clerkMiddleware to all routes in this router
router.use(clerkMiddleware());

/* FIXED ROUTES FIRST */
router.get("/", getServiceAppointments);
router.get("/stats/summary", getServiceAppointmentStats);
router.get("/me", requireAuth(), getServiceAppointmentsByPatient);
router.post("/", requireAuth(), createServiceAppointment);

/* ID ROUTES LAST */
router.get("/:id", getServiceAppointmentById);
router.put("/:id", requireAuth(), updateServiceAppointment);
router.post("/:id/cancel", requireAuth(), cancelServiceAppointment);

export default router;