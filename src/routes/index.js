const router = require("express").Router();

router.use("/auth", require("./auth.routes"));
router.use("/vendors", require("./vendor.routes"));
router.use("/items", require("./item.routes"));
router.use("/dairies", require("./dairy.routes"));
router.use("/purchases", require("./purchase.routes"));
router.use("/vendor-payments", require("./vendorPayment.routes"));
router.use("/production", require("./production.routes"));
router.use("/dispatch", require("./dispatch.routes"));
router.use("/bills", require("./bill.routes"));
router.use("/inventory", require("./inventory.routes"));
router.use("/dashboard", require("./dashboard.routes"));
router.use("/notifications", require("./notification.routes"));
router.use("/reports", require("./report.routes"));
router.use("/users", require("./user.routes"));
router.use("/masters", require("./simpleMaster.routes"));
router.use("/meta", require("./meta.routes"));

module.exports = router;
