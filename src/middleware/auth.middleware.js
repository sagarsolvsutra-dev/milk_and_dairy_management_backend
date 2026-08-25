const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const User = require("../models/User.model");
const Dairy = require("../models/Dairy.model");

const protect = asyncHandler(async (req, res, next) => {
  let token = null;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) throw new ApiError(401, "Not authenticated — please login");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, "Session expired — please login again");
  }

  if (decoded.authType === "dairy") {
    const dairy = await Dairy.findById(decoded.id);
    if (!dairy || dairy.status !== "active") {
      throw new ApiError(401, "Dairy account not found or deactivated");
    }
    req.user = {
      _id: dairy._id,
      name: dairy.name,
      role: "dairy_user",
      dairy: dairy._id,
      permissions: [],
    };
    req.authType = "dairy";
  } else {
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      throw new ApiError(401, "Account not found or deactivated");
    }
    req.user = user;
    req.authType = "user";
  }

  next();
});

module.exports = { protect };
