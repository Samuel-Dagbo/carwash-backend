const mongoose = require("mongoose");
const generateBookingReference = require("../utils/bookingReference");

const bookingSchema = new mongoose.Schema({
  bookingReference: { type: String, unique: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  customerName: { type: String, required: true },
  customerContact: { type: String, required: true },
  customerEmail: { type: String },
  service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  status: {
    type: String,
    enum: ["Pending", "Approved", "In Progress", "Completed", "Rejected", "Cancelled"],
    default: "Pending",
  },
  totalAmount: { type: Number, min: 0 },
  // New fields
  vehicleMake: { type: String, trim: true },
  vehicleModel: { type: String, trim: true },
  vehiclePlate: { type: String, trim: true },
  notes: { type: String, trim: true },
  // Cancellation tracking
  cancelledAt: { type: Date },
  cancelledBy: { type: String, enum: ["customer", "admin", null], default: null },
  cancellationReason: { type: String, trim: true },
  // Reschedule tracking
  originalDate: { type: Date },
  originalTime: { type: String },
  rescheduledAt: { type: Date },
  // Admin notes
  adminNotes: { type: String, trim: true },
}, { timestamps: true });

bookingSchema.pre("validate", function populateBookingReference() {
  if (!this.bookingReference) {
    this.bookingReference = generateBookingReference();
  }
});

module.exports = mongoose.model("Booking", bookingSchema);
