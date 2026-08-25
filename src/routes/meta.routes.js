const router = require("express").Router();
const ctrl = require("../controllers/meta.controller");
const { protect } = require("../middleware/auth.middleware");
const { restrictTo } = require("../middleware/role.middleware");

router.get("/permission-modules", protect, restrictTo("super_admin"), ctrl.getPermissionModules);

module.exports = router;
