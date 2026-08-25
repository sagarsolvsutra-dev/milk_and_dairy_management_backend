const router = require("express").Router();
const ctrl = require("../controllers/bill.controller");
const { protect } = require("../middleware/auth.middleware");
const { restrictTo } = require("../middleware/role.middleware");

router.use(protect, restrictTo("super_admin", "dairy_user"));

router.get("/", ctrl.getBills);
router.post("/", ctrl.createBill);
router.get("/:id", ctrl.getBill);
router.get("/:id/pdf", ctrl.downloadBillPdf);
router.patch("/:id/cancel", ctrl.cancelBill);

module.exports = router;
