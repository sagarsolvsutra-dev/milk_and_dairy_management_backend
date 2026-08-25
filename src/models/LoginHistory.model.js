const mongoose = require("mongoose");

const loginHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", default: null },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    loginAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LoginHistory", loginHistorySchema);
