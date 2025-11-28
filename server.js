require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const { protect } = require("./middleware/authMiddleware.js");

const authRoutes = require("./routes/authRoutes.js");
const bookRoutes = require("./routes/BookRoutes.js");
const gameRoutes = require("./routes/gameRoutes.js");
const slotRoutes = require("./routes/slots.js");
const contactRoutes = require("./routes/contact.js");
const paymentRoutes = require("./routes/paymentRoutes");

const Game = require("./models/Game.js");
const User = require("./models/User.js");
const Booking = require("./models/BookModel.js");

const app = express();

// ----------------------------
// CORS (Render + localhost)
// ----------------------------
app.use(
  cors({
origin: [
  "http://localhost:3000",
  "https://your-frontend-domain.onrender.com"
],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(bodyParser.json());

// ----------------------------
// MONGO DB CONNECTION
// ----------------------------
let isConnected = false;

async function connectToMongoDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Error:", error.message);
  }
}

app.use(async (req, res, next) => {
  if (!isConnected) await connectToMongoDB();
  next();
});

// ----------------------------
// ROUTES
// ----------------------------
app.use("/api/games", gameRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/bookings", bookRoutes);
app.use("/api", authRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/payments", paymentRoutes);

// ----------------------------
// USER MANAGEMENT
// ----------------------------
app.get("/api/users", async (req, res) => {
  try {
    res.json(await User.find());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    res.json(
      await User.findByIdAndUpdate(req.params.id, req.body, { new: true })
    );
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ----------------------------
// NODEMAILER
// ----------------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// ----------------------------
// SMART BOOK
// ----------------------------
app.post("/api/smart-book", async (req, res) => {
  try {
    const { username, email, phone, game, location, time, peopleCount } =
      req.body;

    const existing = await Booking.findOne({ location, time });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "Slot already booked!" });

    const gameData = await Game.findOne({ name: game });
    if (!gameData)
      return res.status(404).json({ success: false, message: "Game not found" });

    const totalPrice = (gameData.price || 500) * peopleCount;

    const newBooking = await Booking.create({
      username,
      email,
      phone,
      game,
      location,
      time,
      peopleCount,
      totalPrice,
    });

    // Store PDF TEMPORARILY (Render supports /tmp)
    const pdfPath = path.join("/tmp", `ticket-${Date.now()}.pdf`);

    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(pdfPath));
    doc.fontSize(22).text("Gamio Booking Confirmation", { align: "center" });
    doc.moveDown();
    doc.text(`Name: ${username}`);
    doc.text(`Game: ${game}`);
    doc.text(`Location: ${location}`);
    doc.text(`Time: ${time}`);
    doc.text(`People: ${peopleCount}`);
    doc.text(`Total Price: ₹${totalPrice}`);
    doc.end();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Gamio Booking Confirmation 🎉",
      text: `Hi ${username}, your booking is confirmed!`,
      attachments: [
        {
          filename: "Gamio-Ticket.pdf",
          path: pdfPath,
        },
      ],
    });

    res.json({
      success: true,
      message: "Booking confirmed & ticket sent to email",
      newBooking,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Booking failed" });
  }
});

// ----------------------------
// 404
// ----------------------------
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
