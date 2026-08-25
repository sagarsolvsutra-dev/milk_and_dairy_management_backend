const mongoose = require("mongoose");

const productionEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    batchNo: { type: String, required: true, unique: true },
    items: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
        quantity: { type: Number, required: true, min: [0.01, "Quantity must be greater than 0"] },
        milkConsumed: { type: Number, required: true, min: 0 },
      },
    ],
    totalMilkConsumed: { type: Number, required: true },
    remark: { type: String, default: "" },
    status: { type: String, enum: ["active", "cancelled"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Covers the list/report queries this collection actually gets: sorted by
// date, with or without an active-status filter.
productionEntrySchema.index({ status: 1, date: -1 });

module.exports = mongoose.model("ProductionEntry", productionEntrySchema);
