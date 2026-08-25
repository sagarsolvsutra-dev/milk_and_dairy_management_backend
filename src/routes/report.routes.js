const router = require("express").Router();
const ctrl = require("../controllers/report.controller");
const { protect } = require("../middleware/auth.middleware");
const { canDo, viewReports } = require("../middleware/role.middleware");

router.use(protect);

router.get("/milk-purchase", ...canDo("reports", "view"), ctrl.milkPurchaseReport);
router.get("/production", ...canDo("reports", "view"), ctrl.productionReport);
router.get("/dispatch", ...canDo("reports", "view"), ctrl.dispatchReport);
router.get("/dairy-sales", viewReports, ctrl.dairySalesReport);
router.get("/item-wise-sales", viewReports, ctrl.itemWiseSalesReport);
router.get("/stock", viewReports, ctrl.stockReport);
router.get("/monthly-yearly", ...canDo("reports", "view"), ctrl.monthlyYearlyReport);
router.get("/profit", ...canDo("reports", "view"), ctrl.profitReport);

module.exports = router;
