const User = require("../models/User.model");
const Dairy = require("../models/Dairy.model");
const LoginHistory = require("../models/LoginHistory.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { generateAccessToken, generateRefreshToken } = require("../utils/generateTokens");

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

exports.login = asyncHandler(async (req, res) => {
  const { loginId, password } = req.body;
  if (!loginId || !password) throw new ApiError(400, "Login ID and password are required");

  const normalizedId = loginId.trim().toLowerCase();

  let account = await User.findOne({ loginId: normalizedId }).select("+password");
  let authType = "user";

  if (!account) {
    account = await Dairy.findOne({ loginId: normalizedId }).select("+password");
    authType = "dairy";
  }

  if (!account) throw new ApiError(401, "Invalid login ID or password");

  if (authType === "user" && !account.isActive) {
    throw new ApiError(403, "Your account has been deactivated. Contact admin.");
  }
  if (authType === "dairy" && account.status !== "active") {
    throw new ApiError(403, "This dairy account has been deactivated. Contact admin.");
  }

  const isMatch = await account.comparePassword(password);
  if (!isMatch) throw new ApiError(401, "Invalid login ID or password");

  const role = authType === "dairy" ? "dairy_user" : account.role;
  const dairyId = authType === "dairy" ? account._id : account.dairy;

  const accessToken = generateAccessToken({ id: account._id, role, dairy: dairyId, authType });
  const refreshToken = generateRefreshToken({ id: account._id, authType });

  if (authType === "user") {
    account.lastLogin = new Date();
    await account.save({ validateBeforeSave: false });
  }

  await LoginHistory.create({
    user: authType === "user" ? account._id : null,
    dairy: authType === "dairy" ? account._id : null,
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  });

  res
    .cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 })
    .cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          accessToken,
          user: {
            id: account._id,
            name: account.name,
            email: account.email || null,
            loginId: account.loginId,
            role,
            dairy: dairyId,
            roleTitle: account.roleTitle || null,
            permissions: account.permissions || [],
          },
        },
        "Login successful"
      )
    );
});

exports.getMe = asyncHandler(async (req, res) => {
  const { role, dairy } = req.user;
  res.status(200).json(
    new ApiResponse(200, {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email || null,
      loginId: req.user.loginId || null,
      role,
      dairy,
      roleTitle: req.user.roleTitle || null,
      permissions: req.user.permissions || [],
    })
  );
});

exports.logout = asyncHandler(async (req, res) => {
  res
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .status(200)
    .json(new ApiResponse(200, null, "Logged out successfully"));
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    throw new ApiError(400, "New password must be at least 4 characters");
  }

  const Model = req.authType === "dairy" ? Dairy : User;
  const account = await Model.findById(req.user._id).select("+password");

  const isMatch = await account.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(401, "Current password is incorrect");

  account.password = newPassword;
  await account.save();

  res.status(200).json(new ApiResponse(200, null, "Password changed successfully"));
});
