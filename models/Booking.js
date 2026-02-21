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
    enum: ["Pending", "Approved", "In Progress", "Completed", "Rejected"],
    default: "Pending",
  },
  totalAmount: { type: Number, min: 0 },
}, { timestamps: true });

bookingSchema.pre("validate", function populateBookingReference() {
  if (!this.bookingReference) {
    this.bookingReference = generateBookingReference();
  }
});

module.exports = mongoose.model("Booking", bookingSchema);
