const { z } = require("zod");
const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const Review = require("../models/Review");

const createReviewSchema = z.object({
  orderId: z.string().regex(/^[a-f\d]{24}$/i),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional().default("")
}).strict();

async function createReview(req, res) {
  const parsed = createReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a rating from 1 to 5 and enter a comment under 500 characters" });

  const order = await Order.findOne({
    _id: parsed.data.orderId,
    customerId: req.user._id,
    status: "ready"
  }).select("restaurantId");
  if (!order) return res.status(403).json({ error: "You can review an order after the restaurant marks it ready" });

  try {
    const review = await Review.create({
      restaurantId: order.restaurantId,
      customerId: req.user._id,
      orderId: order._id,
      rating: parsed.data.rating,
      comment: parsed.data.comment
    });
    return res.status(201).json({ review });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "You have already reviewed this order" });
    throw error;
  }
}

async function listRestaurantReviews(req, res) {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, status: "approved" }).select("_id");
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const [reviews, stats] = await Promise.all([
    Review.find({ restaurantId: restaurant._id }).populate("customerId", "name").sort({ createdAt: -1 }).limit(30),
    Review.aggregate([
      { $match: { restaurantId: restaurant._id } },
      { $group: { _id: null, averageRating: { $avg: "$rating" }, ratingCount: { $sum: 1 } } }
    ])
  ]);
  return res.json({
    ratingAverage: stats[0]?.averageRating || 0,
    ratingCount: stats[0]?.ratingCount || 0,
    reviews: reviews.map(review => ({
      id: review._id,
      customerName: review.customerId?.name || "Customer",
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt
    }))
  });
}

async function listOwnRestaurantReviews(req, res) {
  const restaurant = req.user.role === "restaurant_staff"
    ? await Restaurant.findById(req.user.restaurantId).select("_id")
    : await Restaurant.findOne({ ownerId: req.user._id }).select("_id");
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const reviews = await Review.find({ restaurantId: restaurant._id })
    .populate("customerId", "name")
    .sort({ createdAt: -1 }).limit(100);
  return res.json({ reviews: reviews.map(review => ({
    id: review._id,
    customerName: review.customerId?.name || "Customer",
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt
  })) });
}

module.exports = { createReview, listRestaurantReviews, listOwnRestaurantReviews };
