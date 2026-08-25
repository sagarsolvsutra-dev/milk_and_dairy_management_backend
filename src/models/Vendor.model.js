const mongoose = require("mongoose");
const { mobileField, ifscField } = require("../utils/validators");

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: [2, "Vendor name must be at least 2 characters"] },
    mobile: mobileField(),
    address: { type: String, trim: true },
    city: { type: mongoose.Schema.Types.ObjectId, ref: "City", default: null },
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    bankDetail: {
      accountNo: { type: String, trim: true },
      ifsc: ifscField(),
      bankName: { type: String, trim: true },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", vendorSchema);
