const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const adminAuth = require("../middleware/authMiddleware");
const User = require("../models/User");

// Customer booking status lookup (no login required)
router.get("/track/:bookingReference", async (req, res) => {
  try {
    const { bookingReference } = req.params;
    const { contact } = req.query;

    if (!contact) {
      return res.status(400).json({ message: "Contact is required" });
    }

    const booking = await Booking.findOne({
      bookingReference,
      customerContact: contact,
    }).populate("service");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.json(booking);
  } catch (error) {
    return res.status(500).json({ message: "Failed to track booking" });
  }
});

// CREATE booking request
router.post("/", async (req, res) => {
  try {
    const { customerName, customerContact, customerEmail, service, date, time } = req.body || {};
    const authPayload = adminAuth.getTokenPayloadIfPresent(req);

    let bookingName = customerName;
    let bookingContact = customerContact;
    let bookingEmail = customerEmail;
    let bookingCustomerId;

    if (authPayload?.role === "customer" && authPayload?.id && mongoose.Types.ObjectId.isValid(authPayload.id)) {
      const customer = await User.findById(authPayload.id);
      if (customer) {
        bookingName = bookingName || customer.name;
        bookingContact = bookingContact || customer.contact;
        bookingEmail = bookingEmail || customer.email;
        bookingCustomerId = customer._id;
      }
    }

    if (!bookingName || !bookingContact || !service || !date || !time) {
      return res.status(400).json({
        message: "customerName, customerContact, service, date and time are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(service)) {
      return res.status(400).json({ message: "Invalid service selected" });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid booking date" });
    }

    const selectedService = await Service.findOne({ _id: service, isActive: true });
    if (!selectedService) {
      return res.status(404).json({ message: "Selected service is not available" });
    }

    const booking = new Booking({
      customer: bookingCustomerId,
      customerName: bookingName.trim(),
      customerContact: bookingContact.trim(),
      customerEmail: bookingEmail ? bookingEmail.trim() : undefined,
      service,
      date: parsedDate,
      time,
      status: "Pending",
      totalAmount: selectedService.price || 0,
    });

    const created = await booking.save();
    const populated = await created.populate("service");
    return res.status(201).json(populated);
  } catch (error) {
    console.error("Booking creation error:", error);
    return res.status(500).json({ message: error.message || "Failed to create booking" });
  }
});

// GET logged-in customer bookings
router.get("/my", adminAuth.customerAuth, async (req, res) => {
  try {
    const customer = await User.findById(req.customer.id).select("email contact");
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const bookings = await Booking.find({ customer: req.customer.id })
      .populate("service")
      .sort({ date: -1, createdAt: -1 });

    // Backward compatibility for bookings created before customer linkage.
    const legacyBookings = await Booking.find({
      $and: [
        { $or: [{ customer: { $exists: false } }, { customer: null }] },
        { $or: [{ customerEmail: customer.email }, { customerContact: customer.contact }] },
      ],
    }).populate("service");

    const merged = [...bookings, ...legacyBookings].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    return res.json(merged);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load your bookings" });
  }
});

// GET bookings (admin)
router.get("/", adminAuth, async (req, res) => {
  try {
    const { status, dateFrom, dateTo } = req.query;
    const filter = {};

    if (status && status !== "All") {
      filter.status = status;
    }

    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) {
        filter.date.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    const bookings = await Booking.find(filter)
      .populate("service")
      .sort({ createdAt: -1 });

    return res.json(bookings);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load bookings" });
  }
});

// UPDATE booking status/reschedule (admin)
router.patch("/:id", adminAuth, async (req, res) => {
  try {
    const { status, date, time } = req.body || {};
    const updates = {};

    if (status) {
      const allowed = ["Pending", "Approved", "In Progress", "Completed", "Rejected"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid booking status" });
      }
      updates.status = status;
    }

    if (date) {
      updates.date = new Date(date);
    }

    if (time) {
      updates.time = time;
    }

    const updated = await Booking.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate("service");

    if (!updated) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update booking" });
  }
});

module.exports = router;
