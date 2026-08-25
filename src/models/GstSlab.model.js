const mongoose = require("mongoose");

const gstSlabSchema = new mongoose.Schema(
  {
    percent: {
      type: Number,
      required: true,
      unique: true,
      min: [0, "GST percent cannot be negative"],
      max: [100, "GST percent cannot exceed 100"],
    },
    label: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GstSlab", gstSlabSchema);
