const mongoose = require("mongoose");

const dairyItemStockSchema = new mongoose.Schema(
  {
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    currentQty: { type: Number, default: 0 },
  },
  { timestamps: true }
);

dairyItemStockSchema.index({ dairy: 1, item: 1 }, { unique: true });

module.exports = mongoose.model("DairyItemStock", dairyItemStockSchema);
