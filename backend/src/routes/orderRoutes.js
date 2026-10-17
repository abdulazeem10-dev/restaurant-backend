const express = require("express");
const controller = require("../controllers/orderController");
const authenticate = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.post("/", authenticate, authorize("customer"), asyncHandler(controller.createOrder));
router.get("/mine", authenticate, authorize("customer"), asyncHandler(controller.listMyOrders));
router.get("/restaurant", authenticate, authorize("restaurant"), asyncHandler(controller.listRestaurantOrders));
router.patch("/restaurant/:id", authenticate, authorize("restaurant"), asyncHandler(controller.updateRestaurantOrder));
module.exports = router;
