const mongoose = require("mongoose");

const vendorLedgerEntrySchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    date: { type: Date, required: true, default: Date.now },
    particulars: { type: String, required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    balanceAfter: { type: Number, required: true },
    refModel: { type: String, enum: ["PurchaseEntry", "VendorPayment", "Opening"], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

vendorLedgerEntrySchema.index({ vendor: 1, date: 1 });

module.exports = mongoose.model("VendorLedgerEntry", vendorLedgerEntrySchema);
