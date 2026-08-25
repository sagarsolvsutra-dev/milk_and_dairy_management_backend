const mongoose = require("mongoose");

const vendorPaymentSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    date: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true, min: [0.01, "Amount must be greater than 0"] },
    mode: { type: String, enum: ["Cash", "UPI", "Bank", "Cheque"], default: "Cash" },
    referenceNo: { type: String, default: "" },
    adjustedBills: [
      {
        purchaseEntry: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseEntry" },
        amount: Number,
      },
    ],
    remark: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// getPayments filters/sorts by vendor + date.
vendorPaymentSchema.index({ vendor: 1, date: -1 });

module.exports = mongoose.model("VendorPayment", vendorPaymentSchema);
