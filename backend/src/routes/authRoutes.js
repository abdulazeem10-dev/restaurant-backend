const express = require("express");
const controller = require("../controllers/authController");
const authenticate = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
});

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));
router.post("/google", asyncHandler(controller.googleLogin));
router.post("/password-reset/request", passwordResetLimiter, asyncHandler(controller.requestPasswordReset));
router.post("/password-reset/confirm", passwordResetLimiter, asyncHandler(controller.resetPassword));
router.get("/me", authenticate, asyncHandler(controller.me));

module.exports = router;
