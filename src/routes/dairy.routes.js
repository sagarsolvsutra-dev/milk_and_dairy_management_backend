const router = require("express").Router();
const ctrl = require("../controllers/dairy.controller");
const { protect } = require("../middleware/auth.middleware");
const { restrictTo } = require("../middleware/role.middleware");

router.use(protect, restrictTo("super_admin"));

router.get("/", ctrl.getDairies);
router.post("/", ctrl.createDairy);
router.get("/:id", ctrl.getDairy);
router.get("/:id/summary", ctrl.getDairySummary);
router.put("/:id", ctrl.updateDairy);
router.patch("/:id/toggle-status", ctrl.toggleDairyStatus);
router.patch("/:id/reset-password", ctrl.resetDairyPassword);
router.delete("/:id", ctrl.deleteDairy);

module.exports = router;
