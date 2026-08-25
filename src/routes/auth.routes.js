const router = require("express").Router();
const { login, getMe, logout, changePassword } = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.post("/change-password", protect, changePassword);

module.exports = router;
