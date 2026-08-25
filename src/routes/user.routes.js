const router = require("express").Router();
const ctrl = require("../controllers/user.controller");
const { protect } = require("../middleware/auth.middleware");
const { restrictTo } = require("../middleware/role.middleware");

router.use(protect, restrictTo("super_admin"));

router.get("/", ctrl.getUsers);
router.post("/", ctrl.createUser);
router.get("/activity-log", ctrl.getActivityLogs);
router.get("/login-history", ctrl.getLoginHistory);
router.get("/:id", ctrl.getUser);
router.put("/:id", ctrl.updateUser);
router.patch("/:id/toggle-status", ctrl.toggleUserStatus);
router.patch("/:id/reset-password", ctrl.resetUserPassword);
router.delete("/:id", ctrl.deleteUser);

module.exports = router;
