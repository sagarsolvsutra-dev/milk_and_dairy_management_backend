const User = require("../models/User.model");
const ActivityLog = require("../models/ActivityLog.model");
const LoginHistory = require("../models/LoginHistory.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");

exports.createUser = asyncHandler(async (req, res) => {
  const user = await User.create({ ...req.body, role: "staff", createdBy: req.user._id });
  res.status(201).json(new ApiResponse(201, user.toSafeObject(), "Team member created successfully"));
});

// Team management only ever lists/edits staff accounts — the Super Admin's own
// account is not manageable from this screen.
exports.getUsers = asyncHandler(async (req, res) => {
  const { search = "", page = 1, limit = 10, isActive } = req.query;
  const filter = { role: "staff" };

  if (search) {
    filter.$or = ["name", "loginId", "mobile", "role", "roleTitle", "email"].map((f) => ({
      [f]: { $regex: search, $options: "i" },
    }));
  }
  if (isActive !== undefined) filter.isActive = isActive === "true";

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: "staff" }).lean();
  if (!user) throw new ApiError(404, "Team member not found");
  res.status(200).json(new ApiResponse(200, user));
});

exports.updateUser = asyncHandler(async (req, res) => {
  const { password, role, ...rest } = req.body;
  const user = await User.findOneAndUpdate({ _id: req.params.id, role: "staff" }, rest, {
    new: true,
    runValidators: true,
  });
  if (!user) throw new ApiError(404, "Team member not found");
  res.status(200).json(new ApiResponse(200, user, "Team member updated successfully"));
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findOneAndDelete({ _id: req.params.id, role: "staff" });
  if (!user) throw new ApiError(404, "Team member not found");
  res.status(200).json(new ApiResponse(200, null, "Team member deleted successfully"));
});

exports.toggleUserStatus = asyncHandler(async (req, res) => {
  // Atomic flip — a read-then-write would lose an update if two toggle
  // requests for the same user overlap (e.g. an impatient double-click).
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: "staff" },
    [{ $set: { isActive: { $not: "$isActive" } } }],
    { new: true, updatePipeline: true }
  );
  if (!user) throw new ApiError(404, "Team member not found");
  res.status(200).json(new ApiResponse(200, user, "Status updated"));
});

exports.resetUserPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    throw new ApiError(400, "Password must be at least 4 characters");
  }
  const user = await User.findOne({ _id: req.params.id, role: "staff" });
  if (!user) throw new ApiError(404, "Team member not found");
  user.password = password;
  await user.save({ validateModifiedOnly: true });
  res.status(200).json(new ApiResponse(200, null, "Password reset successfully"));
});

exports.getActivityLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, user } = req.query;
  const filter = {};
  if (user) filter.user = user;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate("user", "name loginId")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
});

exports.getLoginHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total] = await Promise.all([
    LoginHistory.find()
      .populate("user", "name loginId")
      .populate("dairy", "name code")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    LoginHistory.countDocuments(),
  ]);

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
});
