const router = require("express").Router();
const ctrl = require("../controllers/purchase.controller");
const { protect } = require("../middleware/auth.middleware");
const { canDo } = require("../middleware/role.middleware");

router.use(protect);

router.get("/", ...canDo("purchase", "view"), ctrl.getPurchases);
router.post("/", ...canDo("purchase", "add"), ctrl.createPurchase);
router.get("/:id", ...canDo("purchase", "view"), ctrl.getPurchase);
router.put("/:id", ...canDo("purchase", "edit"), ctrl.updatePurchase);
router.patch("/:id/cancel", ...canDo("purchase", "delete"), ctrl.cancelPurchase);
router.delete("/:id", ...canDo("purchase", "delete"), ctrl.deletePurchase);

module.exports = router;
