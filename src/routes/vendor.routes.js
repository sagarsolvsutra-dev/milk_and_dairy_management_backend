const router = require("express").Router();
const ctrl = require("../controllers/vendor.controller");
const { protect } = require("../middleware/auth.middleware");
const { adminOnly, canDo, checkPermission } = require("../middleware/role.middleware");

router.use(protect, adminOnly);

router.get("/", checkPermission("vendor", "view"), ctrl.getVendors);
router.post("/", ...canDo("vendor", "add"), ctrl.createVendor);
router.get("/:id", checkPermission("vendor", "view"), ctrl.getVendor);
router.get("/:id/ledger", checkPermission("vendor", "view"), ctrl.getVendorLedger);
router.put("/:id", ...canDo("vendor", "edit"), ctrl.updateVendor);
router.patch("/:id/toggle-status", ...canDo("vendor", "edit"), ctrl.toggleVendorStatus);
router.delete("/:id", ...canDo("vendor", "delete"), ctrl.deleteVendor);

module.exports = router;
