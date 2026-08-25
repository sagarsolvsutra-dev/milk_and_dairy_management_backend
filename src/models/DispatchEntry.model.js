const mongoose = require("mongoose");

const dispatchEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    dispatchNo: { type: String, required: true, unique: true },
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", required: true },
    items: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
        quantity: { type: Number, required: true, min: [0.01, "Quantity must be greater than 0"] },
      },
    ],
    vehicleNo: { type: String, default: "" },
    driverName: { type: String, default: "" },
    remark: { type: String, default: "" },
    status: { type: String, enum: ["active", "cancelled"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Covers the list/report queries this collection actually gets: sorted by
// date, filtered by dairy (dairy-scoped view) and/or active status.
dispatchEntrySchema.index({ status: 1, date: -1 });
dispatchEntrySchema.index({ dairy: 1, date: -1 });

module.exports = mongoose.model("DispatchEntry", dispatchEntrySchema);
