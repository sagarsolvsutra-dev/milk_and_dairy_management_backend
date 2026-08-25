const Notification = require("../models/Notification.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");

exports.getNotifications = asyncHandler(async (req, res) => {
  const filter =
    req.user.role === "dairy_user"
      ? { $or: [{ audience: "dairy", dairy: req.user.dairy }, { audience: "all" }] }
      : { $or: [{ audience: "super_admin" }, { audience: "all" }] };

  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  const unreadCount = await Notification.countDocuments({ ...filter, isRead: false });

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
    { isRead: true },
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

  await Notification.updateMany(filter, { isRead: true });
  res.status(200).json(new ApiResponse(200, null, "All notifications marked as read"));
});
