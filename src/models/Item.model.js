const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: [2, "Item name must be at least 2 characters"] },
    code: { type: String, required: true, unique: true, trim: true },
    category: { type: String, trim: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    recipe: {
      milkQtyPerUnit: { type: Number, required: true, default: 0, min: [0, "Milk quantity cannot be negative"] },
      milkUnit: { type: String, default: "KG" },
    },
    defaultSellingPrice: { type: Number, default: 0, min: [0, "Selling price cannot be negative"] },
    gstSlab: { type: mongoose.Schema.Types.ObjectId, ref: "GstSlab", default: null },
    minStockAlert: { type: Number, default: 0, min: [0, "Minimum stock alert cannot be negative"] },
    photoUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Item", itemSchema);
