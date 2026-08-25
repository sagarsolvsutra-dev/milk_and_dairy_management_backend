const router = require("express").Router();
const ctrl = require("../controllers/dispatch.controller");
const { protect } = require("../middleware/auth.middleware");
const { canDo } = require("../middleware/role.middleware");

router.use(protect);

router.get("/", ...canDo("dispatch", "view"), ctrl.getDispatches);
router.post("/", ...canDo("dispatch", "add"), ctrl.createDispatch);
router.get("/:id", ...canDo("dispatch", "view"), ctrl.getDispatch);
router.put("/:id", ...canDo("dispatch", "edit"), ctrl.updateDispatch);
router.patch("/:id/cancel", ...canDo("dispatch", "delete"), ctrl.cancelDispatch);

module.exports = router;
