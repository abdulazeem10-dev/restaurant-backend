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
const phoneOtpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many code requests. Please wait 15 minutes and try again." }
});
const phoneOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many code attempts. Please wait 15 minutes and try again." }
});

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));
router.post("/phone/otp/request", phoneOtpSendLimiter, asyncHandler(controller.requestPhoneOtp));
router.post("/phone/otp/verify", phoneOtpVerifyLimiter, asyncHandler(controller.verifyPhoneOtp));
router.post("/google", asyncHandler(controller.googleLogin));
router.post("/password-reset/request", passwordResetLimiter, asyncHandler(controller.requestPasswordReset));
router.post("/password-reset/confirm", passwordResetLimiter, asyncHandler(controller.resetPassword));
router.get("/me", authenticate, asyncHandler(controller.me));

module.exports = router;
