const express = require("express");
const controller = require("../controllers/restaurantController");
const subscriptionPaymentController = require("../controllers/subscriptionPaymentController");
const authenticate = require("../middleware/auth");
const authorizeRestaurant = require("../middleware/authorizeRestaurant");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// Keep fixed /owner paths before /:id routes so "owner" is not cast as an ObjectId.
router.get("/owner/subscription", authenticate, authorize("restaurant"), asyncHandler(controller.getOwnSubscription));
router.post("/owner/subscription/payment/order", authenticate, authorize("restaurant"), asyncHandler(subscriptionPaymentController.createOrder));
router.post("/owner/subscription/payment/verify", authenticate, authorize("restaurant"), asyncHandler(subscriptionPaymentController.verifyPayment));
router.get("/owner/delivery-partners", authenticate, authorizeRestaurant("settings"), asyncHandler(controller.listOwnDeliveryPartners));
router.post("/owner/delivery-partners", authenticate, authorizeRestaurant("settings"), asyncHandler(controller.createOwnDeliveryPartner));
router.patch("/owner/delivery-partners/:id/profile", authenticate, authorizeRestaurant("settings"), asyncHandler(controller.updateOwnDeliveryPartner));
router.patch("/owner/delivery-partners/:id/profile-status", authenticate, authorizeRestaurant("settings"), asyncHandler(controller.setOwnDeliveryPartnerProfileStatus));
router.get("/owner/menu", authenticate, authorizeRestaurant("read"), asyncHandler(controller.getOwnMenu));
router.patch("/owner/profile", authenticate, authorize("restaurant"), asyncHandler(controller.updateOwnProfile));
router.patch("/owner/deactivate-profile", authenticate, authorize("restaurant"), asyncHandler(controller.deactivateOwnProfile));
router.post("/owner/menu", authenticate, authorizeRestaurant("menu"), asyncHandler(controller.createMenuItem));
router.patch("/owner/menu/:id", authenticate, authorizeRestaurant("menu"), asyncHandler(controller.updateMenuItem));
router.delete("/owner/menu/:id", authenticate, authorizeRestaurant("menu"), asyncHandler(controller.deleteMenuItem));
router.patch("/owner/open", authenticate, authorizeRestaurant("settings"), asyncHandler(controller.setOwnOpenStatus));
router.patch("/owner/service-settings", authenticate, authorizeRestaurant("settings"), asyncHandler(controller.updateOwnServiceSettings));
router.get("/owner/reports", authenticate, authorizeRestaurant("settings"), asyncHandler(controller.getOwnReports));
// Only the restaurant's primary owner can create or remove staff accounts.
router.get("/owner/staff", authenticate, authorize("restaurant"), asyncHandler(controller.listOwnStaff));
router.post("/owner/staff", authenticate, authorize("restaurant"), asyncHandler(controller.createOwnStaff));
router.delete("/owner/staff/:staffId", authenticate, authorize("restaurant"), asyncHandler(controller.removeOwnStaff));

router.get("/", asyncHandler(controller.listRestaurants));
router.get("/:id", asyncHandler(controller.getRestaurant));
router.get("/:id/menu", asyncHandler(controller.getPublicMenu));

module.exports = router;
