const express = require("express");
const controller = require("../controllers/restaurantController");
const authenticate = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.get("/", asyncHandler(controller.listRestaurants));
router.get("/:id", asyncHandler(controller.getRestaurant));
router.get("/:id/menu", asyncHandler(controller.getPublicMenu));

router.get("/owner/menu", authenticate, authorize("restaurant"), asyncHandler(controller.getOwnMenu));
router.post("/owner/menu", authenticate, authorize("restaurant"), asyncHandler(controller.createMenuItem));
router.patch("/owner/menu/:id", authenticate, authorize("restaurant"), asyncHandler(controller.updateMenuItem));
router.delete("/owner/menu/:id", authenticate, authorize("restaurant"), asyncHandler(controller.deleteMenuItem));
router.patch("/owner/open", authenticate, authorize("restaurant"), asyncHandler(controller.setOwnOpenStatus));

module.exports = router;
