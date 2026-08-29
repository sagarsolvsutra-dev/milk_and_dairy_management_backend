const Notification = require("../models/Notification.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");

exports.getNotifications = asyncHandler(async (req, res) => {
  const filter =
    req.user.role === "dairy_user"
      ? { $or: [{ audience: "dairy", dairy: req.user.dairy }, { audience: "all" }] }
      : { $or: [{ audience: "super_admin" }, { audience: "all" }] };

  const raw = await Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  // isRead is computed per-requester from readBy — this is a shared document,
  // not exclusively owned by one recipient, so "read" only ever means "read
  // by me", never a global flag other viewers of the same notification share.
  const notifications = raw.map(({ readBy, ...n }) => ({
    ...n,
    // .lean() doesn't backfill schema defaults — a notification created
    // before this field existed has no readBy key at all, not an empty array.
    isRead: (readBy || []).some((id) => String(id) === String(req.user._id)),
  }));
  const unreadCount = await Notification.countDocuments({ ...filter, readBy: { $ne: req.user._id } });

  res.status(200).json(new ApiResponse(200, { notifications, unreadCount }));
});

exports.markAsRead = asyncHandler(async (req, res) => {
  // Scoped the same way getNotifications is — without this, any authenticated
  // user could mark any notification (another dairy's, or an admin-only one)
  // as read just by knowing its id.
  const audienceFilter =
    req.user.role === "dairy_user"
      ? { $or: [{ audience: "dairy", dairy: req.user.dairy }, { audience: "all" }] }
      : { $or: [{ audience: "super_admin" }, { audience: "all" }] };

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, ...audienceFilter },
    { $addToSet: { readBy: req.user._id } },
    { new: true }
  );
  if (!notification) throw new ApiError(404, "Notification not found");
  res.status(200).json(new ApiResponse(200, notification));
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  const filter =
    req.user.role === "dairy_user"
      ? { $or: [{ audience: "dairy", dairy: req.user.dairy }, { audience: "all" }] }
      : { $or: [{ audience: "super_admin" }, { audience: "all" }] };

  await Notification.updateMany(filter, { $addToSet: { readBy: req.user._id } });
  res.status(200).json(new ApiResponse(200, null, "All notifications marked as read"));
});
