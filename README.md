# 🏥 PrimeCare - Hospital Management System

PrimeCare is a full-stack Hospital Management System built using the MERN stack.

The main goal of PrimeCare is to provide a single platform where patients can
find doctors, check their availability, book appointments, book hospital
services, and make online payments.

The system provides separate functionality for Patients, Doctors, and Admins.

---

## 🚀 Features

- 👤 Patient, Doctor and Admin roles
- 🔐 Patient/Admin authentication using Clerk
- 🔑 Doctor authentication using JWT
- 👨‍⚕️ Doctor management
- 📅 Doctor availability and time-slot management
- 🩺 Doctor appointment booking
- 🏥 Hospital service booking
- 💳 Online payment using Razorpay
- 💵 Cash payment option
- 📋 Appointment management
- 📊 Doctor and Admin dashboards
- 🖼️ Doctor and service image storage using Cloudinary

---

## 🛠️ Tech Stack

### Frontend
- React.js
- Vite
- Tailwind CSS
- React Router
- Axios

### Backend
- Node.js
- Express.js
- REST APIs
- JWT
- Multer

### Database
- MongoDB
- Mongoose

### External Services
- Clerk
- Razorpay
- Cloudinary

---

## 🏗️ Project Architecture

```text
                    PrimeCare HMS
                         |
        ┌────────────────┼────────────────┐
        |                |                |
     Patient           Doctor           Admin
        |                |                |
        └────────────────┼────────────────┘
                         ↓
                  React + Vite
                         ↓
                  Axios / REST API
                         ↓
                Node.js + Express
                         ↓
                  MongoDB + Mongoose
                         |
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
       Clerk          Razorpay       Cloudinary
    Authentication     Payment       Image Storage

