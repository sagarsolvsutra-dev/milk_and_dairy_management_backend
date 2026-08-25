const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, minlength: [2, "Unit name must be at least 2 characters"] },
    shortCode: { type: String, required: true, trim: true, minlength: [1, "Short code is required"] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Unit", unitSchema);
