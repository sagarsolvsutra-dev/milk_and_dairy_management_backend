const mongoose = require("mongoose");

const purchaseEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    billNo: { type: String, required: true, unique: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    quantity: { type: Number, required: true, min: [0.01, "Quantity must be greater than 0"] },
    unit: { type: String, enum: ["KG", "Litre"], default: "KG" },
    rate: { type: Number, required: true, min: [0.01, "Rate must be greater than 0"] },
    fatDegree: { type: Number, default: null },
    totalAmount: { type: Number, required: true, min: 0 },
    otherCharges: { type: Number, default: 0, min: [0, "Other charges cannot be negative"] },
    netPayable: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: [0, "Paid amount cannot be negative"] },
    balance: { type: Number, required: true },
    paymentMode: { type: String, enum: ["Cash", "UPI", "Bank", "Cheque"], default: "Cash" },
    dueDate: { type: Date, default: null },
    remark: { type: String, default: "" },
    status: { type: String, enum: ["active", "cancelled"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Covers the list/report queries this collection actually gets: sorted by
// date (with or without a status filter), and filtered by vendor for the
// vendor ledger / vendor-scoped report.
purchaseEntrySchema.index({ status: 1, date: -1 });
purchaseEntrySchema.index({ vendor: 1, date: -1 });

module.exports = mongoose.model("PurchaseEntry", purchaseEntrySchema);
