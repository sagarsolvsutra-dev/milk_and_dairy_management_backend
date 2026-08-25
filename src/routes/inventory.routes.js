const router = require("express").Router();
const ctrl = require("../controllers/inventory.controller");
const { protect } = require("../middleware/auth.middleware");
const { restrictTo, canDo } = require("../middleware/role.middleware");

router.use(protect);

router.get("/milk-stock", ...canDo("inventory", "view"), ctrl.getMilkStock);
router.get("/central-item-stock", ...canDo("inventory", "view"), ctrl.getCentralItemStock);
router.get("/dairy-stock", restrictTo("super_admin", "dairy_user"), ctrl.getDairyStock);
router.get("/consolidated-stock", ...canDo("inventory", "view"), ctrl.getConsolidatedStock);
router.get("/trace/:itemId", ...canDo("inventory", "view"), ctrl.getStockTrace);
router.get("/dairy-comparison", ...canDo("inventory", "view"), ctrl.getDairyComparison);
router.get("/reconciliation", ...canDo("inventory", "view"), ctrl.getStockReconciliation);
router.get("/adjustments", ...canDo("inventory", "view"), ctrl.getStockAdjustments);
router.post("/adjustments", ...canDo("inventory", "add"), ctrl.createStockAdjustment);

module.exports = router;
