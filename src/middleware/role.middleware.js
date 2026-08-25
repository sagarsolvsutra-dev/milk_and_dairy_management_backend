const ApiError = require("../utils/ApiError");

const restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(403, "You do not have permission to perform this action");
    }
    next();
  };

const checkPermission = (module, action) => (req, res, next) => {
  const { role, permissions } = req.user;

  if (role === "super_admin") return next();

  if (role === "staff") {
    const perm = permissions.find((p) => p.module === module);
    if (!perm || !perm[action]) {
      throw new ApiError(403, `You do not have '${action}' permission on '${module}'`);
    }
    return next();
  }

  throw new ApiError(403, "You do not have permission to perform this action");
};

const adminOnly = restrictTo("super_admin", "staff");
const canDo = (module, action) => [adminOnly, checkPermission(module, action)];

// Allows super_admin and dairy_user unconditionally (e.g. dairy panel needs read access
// to shared masters like items); staff still needs the explicit module permission.
const viewWithDairyAccess = (module) => (req, res, next) => {
  if (["super_admin", "dairy_user"].includes(req.user.role)) return next();
  return checkPermission(module, "view")(req, res, next);
};

// Allows super_admin and dairy_user unconditionally (dairy panel reads its own
// sales/stock reports); staff still needs the 'reports' view permission.
const viewReports = (req, res, next) => {
  if (["super_admin", "dairy_user"].includes(req.user.role)) return next();
  return checkPermission("reports", "view")(req, res, next);
};

module.exports = { restrictTo, checkPermission, adminOnly, canDo, viewWithDairyAccess, viewReports };
