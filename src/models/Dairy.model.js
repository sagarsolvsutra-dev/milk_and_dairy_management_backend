const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { mobileField } = require("../utils/validators");

const dairySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: [2, "Dairy name must be at least 2 characters"] },
    code: { type: String, required: true, unique: true, trim: true },
    mobile: mobileField(),
    address: { type: String, trim: true },
    loginId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, "Login ID must be at least 3 characters"],
      match: [/^[a-z0-9._-]+$/, "Login ID can only contain letters, numbers, dots, underscores and hyphens"],
    },
    password: { type: String, required: true, select: false, minlength: [4, "Password must be at least 4 characters"] },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

dairySchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

dairySchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("Dairy", dairySchema);
