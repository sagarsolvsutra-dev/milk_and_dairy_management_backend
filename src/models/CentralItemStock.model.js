const mongoose = require("mongoose");

const centralItemStockSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true, unique: true },
    currentQty: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CentralItemStock", centralItemStockSchema);
