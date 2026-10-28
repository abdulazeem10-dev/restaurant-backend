const { z } = require("zod");
const User = require("../models/User");
const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const mongoose = require("mongoose");

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default("Home"),
  recipientType: z.enum(["self", "other"]),
  name: z.string().trim().min(1).max(100),
  phone: z.string().length(10).regex(/^\d{10}$/),
  flatBuilding: z.string().trim().min(1).max(120),
  lane: z.string().trim().min(1).max(180),
  landmark: z.string().trim().max(120).default(""),
  pincode: z.string().length(6).regex(/^\d{6}$/)
}).strict();

async function listAddresses(req, res) {
  const user = await User.findById(req.user._id).select("savedAddresses").lean();
  return res.json({ addresses: user?.savedAddresses || [] });
}

async function addAddress(req, res) {
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a label, recipient, 10-digit mobile number, complete address, and 6-digit PIN code" });
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "Customer account not found" });
  if (user.savedAddresses.length >= 10) return res.status(400).json({ error: "You can save up to 10 addresses" });
  const duplicate = user.savedAddresses.some(address => ["recipientType", "name", "phone", "flatBuilding", "lane", "landmark", "pincode"].every(key => String(address[key] || "").trim().toLocaleLowerCase() === String(parsed.data[key] || "").trim().toLocaleLowerCase()));
  if (duplicate) return res.status(409).json({ error: "This delivery address is already saved" });
  user.savedAddresses.push(parsed.data);
  await user.save();
  return res.status(201).json({ address: user.savedAddresses[user.savedAddresses.length - 1] });
}

async function deleteAddress(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "Customer account not found" });
  const address = user.savedAddresses.id(req.params.id);
  if (!address) return res.status(404).json({ error: "Saved address not found" });
  address.deleteOne();
  await user.save();
  return res.status(204).end();
}

async function getLoyaltySummary(req, res) {
  const sunrise = await Restaurant.findOne({ name: /^Sunrise Tiffin House$/i, status: "approved" }).select("_id").lean();
  if (!sunrise) return res.json({ loyalty: { points: 0, deliveredOrders: 0, totalSpentPaise: 0, pointsPerTenRupees: 1, rewardMessage: "Earn 1 point for every ₹10 spent on delivered orders" } });
  const orders = await Order.find({ customerId: req.user._id, restaurantId: sunrise._id, status: "delivered" })
    .select("totalPaise")
    .lean();

  const totalSpentPaise = orders.reduce((sum, order) => sum + (Number(order.totalPaise) || 0), 0);
  // One point per ₹10 paid on a delivered order. Calculating this on the server
  // keeps the balance consistent across browsers and prevents client-side edits.
  const points = orders.reduce((sum, order) => sum + Math.floor((Number(order.totalPaise) || 0) / 1000), 0);

  return res.json({
    loyalty: {
      points,
      deliveredOrders: orders.length,
      totalSpentPaise,
      pointsPerTenRupees: 1,
      rewardMessage: "Earn 1 point for every ₹10 spent on delivered orders"
    }
  });
}

async function listFavouriteRestaurants(req, res) {
  const [user, sunrise] = await Promise.all([
    User.findById(req.user._id).select("favoriteRestaurantIds").lean(),
    Restaurant.findOne({ name: /^Sunrise Tiffin House$/i, status: "approved" }).select("_id").lean()
  ]);
  const favorites = (user?.favoriteRestaurantIds || []).map(String);
  return res.json({ restaurantIds: sunrise && favorites.includes(String(sunrise._id)) ? [String(sunrise._id)] : [] });
}

async function addFavouriteRestaurant(req, res) {
  if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.status(400).json({ error: "Invalid restaurant" });
  const restaurant = await Restaurant.findOne({ _id: req.params.restaurantId, name: /^Sunrise Tiffin House$/i, status: "approved" }).select("_id").lean();
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  await User.updateOne({ _id: req.user._id }, { $addToSet: { favoriteRestaurantIds: restaurant._id } });
  return res.status(204).end();
}

async function removeFavouriteRestaurant(req, res) {
  if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.status(400).json({ error: "Invalid restaurant" });
  await User.updateOne({ _id: req.user._id }, { $pull: { favoriteRestaurantIds: req.params.restaurantId } });
  return res.status(204).end();
}

module.exports = { listAddresses, addAddress, deleteAddress, getLoyaltySummary, listFavouriteRestaurants, addFavouriteRestaurant, removeFavouriteRestaurant };
