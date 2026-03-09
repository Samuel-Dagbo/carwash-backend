const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const adminAuth = require("../middleware/authMiddleware");
const User = require("../models/User");

// Default working hours configuration
const DEFAULT_WORKING_HOURS = {
  start: "08:00",
  end: "18:00",
  slotDuration: 30, // minutes
  maxAdvanceDays: 30, // how far in advance customers can book
};

// Get working hours from env or use defaults
const getWorkingHours = () => ({
  start: process.env.WORKING_HOURS_START || DEFAULT_WORKING_HOURS.start,
  end: process.env.WORKING_HOURS_END || DEFAULT_WORKING_HOURS.end,
  slotDuration: parseInt(process.env.SLOT_DURATION) || DEFAULT_WORKING_HOURS.slotDuration,
  maxAdvanceDays: parseInt(process.env.MAX_ADVANCE_DAYS) || DEFAULT_WORKING_HOURS.maxAdvanceDays,
});

// GET available time slots for a specific date
router.get("/available-slots", async (req, res) => {
  try {
    const { date, serviceId } = req.query;
    
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    const selectedDate = new Date(date);
    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const workingHours = getWorkingHours();
    
    // Check if date is in the past
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    
    if (selectedDateOnly < today) {
      return res.status(400).json({ message: "Cannot book for past dates" });
    }

    // Check if within max advance booking days
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + workingHours.maxAdvanceDays);
    if (selectedDate > maxDate) {
      return res.status(400).json({ message: `Cannot book more than ${workingHours.maxAdvanceDays} days in advance` });
    }

    // Check if it's a weekend (optional - can be configured)
    const dayOfWeek = selectedDate.getDay();
    if (dayOfWeek === 0) { // Sunday
      return res.status(400).json({ message: "We are closed on Sundays" });
    }

    // Get service duration if serviceId provided
    let serviceDuration = 30; // default
    if (serviceId) {
      const service = await Service.findById(serviceId);
      if (service) {
        serviceDuration = service.duration;
      }
    }

    // Get all bookings for the selected date
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ["Cancelled", "Rejected"] },
    }).select("time status");

    // Generate available time slots
    const slots = [];
    const [startHour, startMin] = workingHours.start.split(":").map(Number);
    const [endHour, endMin] = workingHours.end.split(":").map(Number);

    let currentTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    while (currentTime + serviceDuration <= endTime) {
      const hours = Math.floor(currentTime / 60);
      const minutes = currentTime % 60;
      const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      
      // Check if slot is booked
      const isBooked = bookings.some(b => b.time === timeStr);
      
      slots.push({
        time: timeStr,
        available: !isBooked,
      });
      
      currentTime += workingHours.slotDuration;
    }

    return res.json({
      date: selectedDate.toISOString().split("T")[0],
      slots,
      workingHours,
    });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    return res.status(500).json({ message: "Failed to fetch available slots" });
  }
});

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
    const { customerName, customerContact, customerEmail, service, date, time, vehicleMake, vehicleModel, vehiclePlate, notes } = req.body || {};
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

    // Validate date is not in the past
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const selectedDateOnly = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    
    if (selectedDateOnly < today) {
      return res.status(400).json({ message: "Cannot book for past dates" });
    }

    // Check working hours
    const workingHours = getWorkingHours();
    const [startHour, startMin] = workingHours.start.split(":").map(Number);
    const [endHour, endMin] = workingHours.end.split(":").map(Number);
    const [bookingHour, bookingMin] = time.split(":").map(Number);
    const bookingTimeInMinutes = bookingHour * 60 + bookingMin;
    const startTimeInMinutes = startHour * 60 + startMin;
    const endTimeInMinutes = endHour * 60 + endMin;

    if (bookingTimeInMinutes < startTimeInMinutes || bookingTimeInMinutes >= endTimeInMinutes) {
      return res.status(400).json({ message: `Bookings are only accepted between ${workingHours.start} and ${workingHours.end}` });
    }

    const selectedService = await Service.findOne({ _id: service, isActive: true });
    if (!selectedService) {
      return res.status(404).json({ message: "Selected service is not available" });
    }

    // Check if time slot is already booked
    const existingBooking = await Booking.findOne({
      date: {
        $gte: new Date(parsedDate.setHours(0, 0, 0, 0)),
        $lte: new Date(parsedDate.setHours(23, 59, 59, 999)),
      },
      time,
      status: { $nin: ["Cancelled", "Rejected"] },
    });

    if (existingBooking) {
      return res.status(409).json({ message: "This time slot is already booked. Please choose another time." });
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
      vehicleMake: vehicleMake?.trim(),
      vehicleModel: vehicleModel?.trim(),
      vehiclePlate: vehiclePlate?.trim(),
      notes: notes?.trim(),
    });

    const created = await booking.save();
    const populated = await created.populate("service");
    
    // TODO: Send confirmation email
    // sendBookingConfirmation(populated);
    
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
    const { status, dateFrom, dateTo, search } = req.query;
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

    // Add search filter
    if (search) {
      filter.$or = [
        { bookingReference: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { customerContact: { $regex: search, $options: "i" } },
        { customerEmail: { $regex: search, $options: "i" } },
        { vehiclePlate: { $regex: search, $options: "i" } },
      ];
    }

    const bookings = await Booking.find(filter)
      .populate("service")
      .sort({ createdAt: -1 });

    return res.json(bookings);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load bookings" });
  }
});

// GET booking statistics (admin)
router.get("/stats", adminAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const dateFilter = {};
    
    if (dateFrom) {
      dateFilter.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    const filter = Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {};

    const [
      totalBookings,
      pendingBookings,
      activeBookings,
      completedBookings,
      cancelledBookings,
      rejectedBookings,
    ] = await Promise.all([
      Booking.countDocuments(filter),
      Booking.countDocuments({ ...filter, status: "Pending" }),
      Booking.countDocuments({ ...filter, status: { $in: ["Approved", "In Progress"] } }),
      Booking.countDocuments({ ...filter, status: "Completed" }),
      Booking.countDocuments({ ...filter, status: "Cancelled" }),
      Booking.countDocuments({ ...filter, status: "Rejected" }),
    ]);

    // Calculate revenue from completed bookings
    const completedBookingsList = await Booking.find({ ...filter, status: "Completed" });
    const totalRevenue = completedBookingsList.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    // Get popular services
    const serviceStats = await Booking.aggregate([
      { $match: { ...filter, status: { $nin: ["Cancelled", "Rejected"] } } },
      { $group: { _id: "$service", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    const populatedServiceStats = await Service.find({
      _id: { $in: serviceStats.map(s => s._id) }
    }).select("name");

    const popularServices = serviceStats.map(s => {
      const service = populatedServiceStats.find(serv => serv._id.toString() === s._id?.toString());
      return {
        serviceId: s._id,
        serviceName: service?.name || "Unknown",
        count: s.count,
      };
    });

    return res.json({
      totalBookings,
      pendingBookings,
      activeBookings,
      completedBookings,
      cancelledBookings,
      rejectedBookings,
      totalRevenue,
      popularServices,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ message: "Failed to load statistics" });
  }
});

// Customer cancel booking
router.patch("/:id/cancel", adminAuth.customerAuth, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Verify the booking belongs to the customer
    if (booking.customer?.toString() !== req.customer.id) {
      // Also check by email/contact for legacy bookings
      const customer = await User.findById(req.customer.id);
      if (booking.customerEmail !== customer?.email && booking.customerContact !== customer?.contact) {
        return res.status(403).json({ message: "You are not authorized to cancel this booking" });
      }
    }

    // Check if booking can be cancelled
    if (["Completed", "Cancelled", "Rejected"].includes(booking.status)) {
      return res.status(400).json({ message: `Cannot cancel a ${booking.status.toLowerCase()} booking` });
    }

    booking.status = "Cancelled";
    booking.cancelledAt = new Date();
    booking.cancelledBy = "customer";
    booking.cancellationReason = reason?.trim();

    const updated = await booking.save();
    const populated = await updated.populate("service");

    // TODO: Send cancellation email
    // sendCancellationEmail(populated);

    return res.json(populated);
  } catch (error) {
    console.error("Cancel booking error:", error);
    return res.status(500).json({ message: "Failed to cancel booking" });
  }
});

// Customer reschedule booking
router.patch("/:id/reschedule", adminAuth.customerAuth, async (req, res) => {
  try {
    const { date, time } = req.body || {};

    if (!date || !time) {
      return res.status(400).json({ message: "New date and time are required" });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Verify the booking belongs to the customer
    if (booking.customer?.toString() !== req.customer.id) {
      const customer = await User.findById(req.customer.id);
      if (booking.customerEmail !== customer?.email && booking.customerContact !== customer?.contact) {
        return res.status(403).json({ message: "You are not authorized to reschedule this booking" });
      }
    }

    // Check if booking can be rescheduled
    if (["Completed", "Cancelled", "Rejected"].includes(booking.status)) {
      return res.status(400).json({ message: `Cannot reschedule a ${booking.status.toLowerCase()} booking` });
    }

    const newDate = new Date(date);
    if (Number.isNaN(newDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    // Validate date is not in the past
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const selectedDateOnly = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
    
    if (selectedDateOnly < today) {
      return res.status(400).json({ message: "Cannot reschedule to a past date" });
    }

    // Check working hours
    const workingHours = getWorkingHours();
    const [startHour, startMin] = workingHours.start.split(":").map(Number);
    const [endHour, endMin] = workingHours.end.split(":").map(Number);
    const [bookingHour, bookingMin] = time.split(":").map(Number);
    const bookingTimeInMinutes = bookingHour * 60 + bookingMin;
    const startTimeInMinutes = startHour * 60 + startMin;
    const endTimeInMinutes = endHour * 60 + endMin;

    if (bookingTimeInMinutes < startTimeInMinutes || bookingTimeInMinutes >= endTimeInMinutes) {
      return res.status(400).json({ message: `Bookings are only accepted between ${workingHours.start} and ${workingHours.end}` });
    }

    // Check if new time slot is available (excluding current booking)
    const existingBooking = await Booking.findOne({
      _id: { $ne: booking._id },
      date: {
        $gte: new Date(newDate.setHours(0, 0, 0, 0)),
        $lte: new Date(newDate.setHours(23, 59, 59, 999)),
      },
      time,
      status: { $nin: ["Cancelled", "Rejected"] },
    });

    if (existingBooking) {
      return res.status(409).json({ message: "This time slot is already booked. Please choose another time." });
    }

    // Store original date/time for tracking
    booking.originalDate = booking.date;
    booking.originalTime = booking.time;
    booking.rescheduledAt = new Date();
    booking.date = newDate;
    booking.time = time;
    booking.status = "Pending"; // Reset to pending for admin approval

    const updated = await booking.save();
    const populated = await updated.populate("service");

    // TODO: Send reschedule email
    // sendRescheduleEmail(populated, booking.originalDate, booking.originalTime);

    return res.json(populated);
  } catch (error) {
    console.error("Reschedule booking error:", error);
    return res.status(500).json({ message: "Failed to reschedule booking" });
  }
});

// UPDATE booking status/reschedule (admin)
router.patch("/:id", adminAuth, async (req, res) => {
  try {
    const { status, date, time, adminNotes } = req.body || {};
    const updates = {};

    if (status) {
      const allowed = ["Pending", "Approved", "In Progress", "Completed", "Rejected", "Cancelled"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid booking status" });
      }
      updates.status = status;
      
      if (status === "Cancelled") {
        updates.cancelledAt = new Date();
        updates.cancelledBy = "admin";
      }
    }

    if (date) {
      const newDate = new Date(date);
      if (Number.isNaN(newDate.getTime())) {
        return res.status(400).json({ message: "Invalid booking date" });
      }
      // Track reschedule
      const booking = await Booking.findById(req.params.id);
      if (booking && (booking.date.toString() !== newDate.toString() || booking.time !== time)) {
        updates.originalDate = booking.date;
        updates.originalTime = booking.time;
        updates.rescheduledAt = new Date();
      }
      updates.date = newDate;
    }

    if (time) {
      updates.time = time;
    }

    if (adminNotes !== undefined) {
      updates.adminNotes = adminNotes.trim();
    }

    const updated = await Booking.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate("service");

    if (!updated) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // TODO: Send status update email
    // sendStatusUpdateEmail(updated);

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update booking" });
  }
});

// DELETE booking (admin)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.json({ message: "Booking deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete booking" });
  }
});

module.exports = router;
