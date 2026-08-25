const mongoose = require("mongoose");
const { ifscField } = require("../utils/validators");

const bankDetailSchema = new mongoose.Schema(
  {
    accountName: { type: String, required: true, trim: true },
    accountNo: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{9,18}$/, "Account number must be 9 to 18 digits"],
    },
    ifsc: ifscField({ required: true }),
    bankName: { type: String, required: true, trim: true },
    branch: { type: String, trim: true },
    upiId: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BankDetail", bankDetailSchema);
