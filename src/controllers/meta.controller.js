const { MODULES } = require("../constants/modules");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");

exports.getPermissionModules = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, MODULES));
});
