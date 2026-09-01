const router = require("express").Router();
const ctrl = require("../controllers/production.controller");
const { protect } = require("../middleware/auth.middleware");
const { canDo } = require("../middleware/role.middleware");

router.use(protect);

router.get("/", ...canDo("production", "view"), ctrl.getProductions);
router.post("/", ...canDo("production", "add"), ctrl.createProduction);
router.get("/:id", ...canDo("production", "view"), ctrl.getProduction);
router.put("/:id", ...canDo("production", "edit"), ctrl.updateProduction);
router.patch("/:id/cancel", ...canDo("production", "delete"), ctrl.cancelProduction);
router.delete("/:id", ...canDo("production", "delete"), ctrl.deleteProduction);

module.exports = router;
