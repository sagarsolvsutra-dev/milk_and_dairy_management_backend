const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", default: null },
    action: { type: String, required: true },
    module: { type: String, required: true },
    details: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
