const express = require("express");
const controller = require("../controllers/paymentController");
const authenticate = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.get("/config", asyncHandler(controller.getPaymentConfig));
router.post("/webhook", asyncHandler(controller.handleWebhook));
router.post("/orders/:id/razorpay-order", authenticate, authorize("customer"), asyncHandler(controller.createRazorpayOrder));
router.post("/orders/:id/verify", authenticate, authorize("customer"), asyncHandler(controller.verifyRazorpayPayment));
router.get("/orders/:id/status", authenticate, authorize("customer"), asyncHandler(controller.getPaymentStatus));
router.post("/orders/:id/cancel", authenticate, authorize("customer"), asyncHandler(controller.cancelPendingPayment));

module.exports = router;
