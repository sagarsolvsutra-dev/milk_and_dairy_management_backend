const router = require("express").Router();
const ctrl = require("../controllers/vendorPayment.controller");
const { protect } = require("../middleware/auth.middleware");
const { canDo } = require("../middleware/role.middleware");

router.use(protect);

router.get("/", ...canDo("purchase_ledger", "view"), ctrl.getPayments);
router.post("/", ...canDo("purchase_ledger", "add"), ctrl.createPayment);
router.get("/outstanding-report", ...canDo("purchase_ledger", "view"), ctrl.getOutstandingReport);

module.exports = router;
