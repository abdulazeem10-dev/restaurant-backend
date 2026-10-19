const express = require("express");
const controller = require("../controllers/authController");
const authenticate = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));
router.post("/phone/otp/request", asyncHandler(controller.requestPhoneOtp));
router.post("/phone/otp/verify", asyncHandler(controller.verifyPhoneOtp));
router.post("/google", asyncHandler(controller.googleLogin));
router.post("/password-reset/request", asyncHandler(controller.requestPasswordReset));
router.post("/password-reset/confirm", asyncHandler(controller.resetPassword));
router.get("/me", authenticate, asyncHandler(controller.me));

module.exports = router;
