const mongoose = require("mongoose");

const stockAdjustmentSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    stockType: { type: String, enum: ["central_item", "dairy_item"], required: true },
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", default: null },
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    quantity: { type: Number, required: true },
    reason: { type: String, required: true },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StockAdjustment", stockAdjustmentSchema);
