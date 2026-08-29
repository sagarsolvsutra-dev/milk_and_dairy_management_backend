const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["vendor_due", "low_stock_central", "low_stock_dairy", "dispatch", "general"],
      default: "general",
    },
    audience: { type: String, enum: ["super_admin", "dairy", "all"], default: "super_admin" },
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", default: null },
    refModel: { type: String, default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Per-recipient read state — a shared-audience notification (super_admin,
    // or "all") is visible to every matching user/dairy at once, so a single
    // isRead boolean would let one person's "read" hide it as read for
    // everyone else too. Each id here (a User._id or a Dairy._id, per
    // req.user._id's normalized shape) marks that one recipient has seen it.
    readBy: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

// getNotifications/markAllAsRead filter by audience+dairy and sort by
// recency; unread counts filter the same way plus readBy.
notificationSchema.index({ audience: 1, dairy: 1, createdAt: -1 });
notificationSchema.index({ audience: 1, readBy: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
