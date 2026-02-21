const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  duration: { type: Number, required: true, min: 1 }, // in minutes
  isActive: { type: Boolean, default: true },
  imageData: { type: Buffer },
  imageMimeType: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("Service", serviceSchema);
