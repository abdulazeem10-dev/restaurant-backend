const express = require("express");
const controller = require("../controllers/adminController");
const authenticate = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate, authorize("admin"));
router.get("/restaurants", asyncHandler(controller.listRestaurants));
router.post("/restaurants", asyncHandler(controller.createRestaurant));
router.get("/delivery-partners", asyncHandler(controller.listDeliveryPartners));
router.post("/delivery-partners", asyncHandler(controller.createDeliveryPartner));
router.patch("/delivery-partners/:id/profile", asyncHandler(controller.updateDeliveryPartner));
router.patch("/restaurants/:id/profile", asyncHandler(controller.updateRestaurantProfile));
router.patch("/restaurants/:id/image", asyncHandler(controller.setRestaurantImage));
router.patch("/restaurants/:id/food-type", asyncHandler(controller.setRestaurantFoodType));
router.patch("/restaurants/:id/cuisine", asyncHandler(controller.setRestaurantCuisine));
router.patch("/restaurants/:id/status", asyncHandler(controller.setRestaurantStatus));
module.exports = router;
