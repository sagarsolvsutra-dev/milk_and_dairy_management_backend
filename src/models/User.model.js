const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { fullPermissions } = require("../constants/modules");
const { mobileField, emailField } = require("../utils/validators");

const permissionSchema = new mongoose.Schema(
  {
    module: { type: String, required: true },
    view: { type: Boolean, default: false },
    add: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: [2, "Name must be at least 2 characters"] },
    mobile: mobileField(),
    email: emailField({ unique: true }),
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
    role: {
      type: String,
      enum: ["super_admin", "dairy_user", "staff"],
      required: true,
    },
    roleTitle: { type: String, trim: true },
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", default: null },
    permissions: { type: [permissionSchema], default: [] },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (this.isNew && this.role === "super_admin" && !this.permissions.length) {
    this.permissions = fullPermissions();
  }
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
