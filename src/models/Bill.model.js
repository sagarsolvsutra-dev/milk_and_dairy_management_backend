const mongoose = require("mongoose");
const { MOBILE_REGEX } = require("../utils/validators");

const billSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    billNo: { type: String, required: true },
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", required: true },
    customerName: { type: String, default: "" },
    customerMobile: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: (v) => !v || MOBILE_REGEX.test(v),
        message: "Mobile number must be exactly 10 digits",
      },
    },
    items: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
        quantity: { type: Number, required: true, min: [0.01, "Quantity must be greater than 0"] },
        rate: { type: Number, required: true, min: [0, "Rate cannot be negative"] },
        discount: { type: Number, default: 0, min: [0, "Discount cannot be negative"] },
        amount: { type: Number, required: true },
      },
    ],
    gstEnabled: { type: Boolean, default: false },
    gstAmount: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    paymentMode: { type: String, enum: ["Cash", "UPI", "Card", "Credit"], default: "Cash" },
    paidAmount: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "cancelled"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

billSchema.index({ dairy: 1, billNo: 1 }, { unique: true });
// Covers the list/report/dashboard queries this collection actually gets:
// sorted by date, filtered by dairy and/or active status.
billSchema.index({ status: 1, date: -1 });
billSchema.index({ dairy: 1, date: -1 });

module.exports = mongoose.model("Bill", billSchema);
