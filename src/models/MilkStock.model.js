const mongoose = require("mongoose");

const milkStockSchema = new mongoose.Schema(
  {
    key: { type: String, default: "central", unique: true },
    currentQty: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MilkStock", milkStockSchema);
