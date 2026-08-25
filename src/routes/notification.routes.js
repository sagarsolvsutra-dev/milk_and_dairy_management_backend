const router = require("express").Router();
const ctrl = require("../controllers/notification.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", ctrl.getNotifications);
router.patch("/:id/read", ctrl.markAsRead);
router.patch("/read-all", ctrl.markAllAsRead);

module.exports = router;
