const express = require("express");
const controller = require("../controllers/orderController");
const paymentController = require("../controllers/paymentController");
const authenticate = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.get("/payment/config", asyncHandler(paymentController.getPaymentConfig));
router.post("/payment/webhook", asyncHandler(paymentController.handleWebhook));
router.post("/", authenticate, authorize("customer"), asyncHandler(controller.createOrder));
router.get("/mine", authenticate, authorize("customer"), asyncHandler(controller.listMyOrders));
router.post("/:id/payment/razorpay", authenticate, authorize("customer"), asyncHandler(paymentController.createRazorpayOrder));
router.post("/:id/payment/verify", authenticate, authorize("customer"), asyncHandler(paymentController.verifyRazorpayPayment));
router.post("/:id/payment/cancel", authenticate, authorize("customer"), asyncHandler(paymentController.cancelPendingPayment));
router.get("/:id/payment/status", authenticate, authorize("customer"), asyncHandler(paymentController.getPaymentStatus));
router.get("/restaurant", authenticate, authorize("restaurant"), asyncHandler(controller.listRestaurantOrders));
router.patch("/restaurant/:id", authenticate, authorize("restaurant"), asyncHandler(controller.updateRestaurantOrder));
module.exports = router;
