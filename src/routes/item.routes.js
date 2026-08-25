const router = require("express").Router();
const ctrl = require("../controllers/item.controller");
const { protect } = require("../middleware/auth.middleware");
const { canDo, viewWithDairyAccess } = require("../middleware/role.middleware");

router.use(protect);

router.get("/", viewWithDairyAccess("item"), ctrl.getItems);
router.post("/", ...canDo("item", "add"), ctrl.createItem);
router.get("/:id", viewWithDairyAccess("item"), ctrl.getItem);
router.put("/:id", ...canDo("item", "edit"), ctrl.updateItem);
router.patch("/:id/toggle-status", ...canDo("item", "edit"), ctrl.toggleItemStatus);
router.delete("/:id", ...canDo("item", "delete"), ctrl.deleteItem);

module.exports = router;
