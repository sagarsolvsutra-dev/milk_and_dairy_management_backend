const router = require("express").Router();
const ctrl = require("../controllers/dashboard.controller");
const { protect } = require("../middleware/auth.middleware");
const { restrictTo, adminOnly } = require("../middleware/role.middleware");

router.use(protect);

router.get("/super-admin", adminOnly, ctrl.getSuperAdminDashboard);
router.get("/dairy", restrictTo("dairy_user"), ctrl.getDairyDashboard);
router.get("/analytics", adminOnly, ctrl.getAnalytics);

module.exports = router;
