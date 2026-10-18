const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/reviewController");
const authenticate = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
const submitReviewLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.get("/restaurant/mine", authenticate, authorize("restaurant"), asyncHandler(controller.listOwnRestaurantReviews));
router.get("/restaurant/:id", asyncHandler(controller.listRestaurantReviews));
router.post("/", authenticate, authorize("customer"), submitReviewLimiter, asyncHandler(controller.createReview));

module.exports = router;
