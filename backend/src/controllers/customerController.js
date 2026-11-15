const { z } = require("zod");
const User = require("../models/User");
const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const mongoose = require("mongoose");
const CustomerCart = require("../models/CustomerCart");
const MenuItem = require("../models/MenuItem");

const cartSchema = z.object({
  restaurantId: z.string().length(24).regex(/^[a-f\d]{24}$/i),
  items: z.array(z.object({
    menuItemId: z.string().length(24).regex(/^[a-f\d]{24}$/i),
    quantity: z.number().int().min(1).max(20),
    note: z.string().trim().max(300).optional().default("")
  }).strict()).max(100)
}).strict();

async function getCart(req, res) {
  const cart = await CustomerCart.findOne({ customerId: req.user._id });
  if (!cart) return res.json({ cart: null });
  const currentItems = await MenuItem.find({ _id: { $in: cart.items.map(item => item.menuItemId) }, restaurantId: cart.restaurantId })
    .select("_id name pricePaise")
    .lean();
  const currentById = new Map(currentItems.map(item => [String(item._id), item]));
  let changed = false;
  for (const item of cart.items) {
    const current = currentById.get(String(item.menuItemId));
    if (!current) continue;
    if (item.name !== current.name || item.pricePaise !== current.pricePaise) {
      item.name = current.name;
      item.pricePaise = current.pricePaise;
      changed = true;
    }
  }
  if (changed) await cart.save();
  return res.json({ cart: { restaurantId: String(cart.restaurantId), items: cart.items } });
}

async function saveCart(req, res) {
  const parsed = cartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid cart" });
  const { restaurantId, items } = parsed.data;
  if (new Set(items.map(item => item.menuItemId)).size !== items.length) return res.status(400).json({ error: "Cart contains duplicate dishes" });
  if (!items.length) {
    await CustomerCart.deleteOne({ customerId: req.user._id });
    return res.json({ cart: null });
  }
  const restaurant = await Restaurant.findById(restaurantId).select("_id status").lean();
  if (!restaurant || restaurant.status !== "approved") return res.status(404).json({ error: "Restaurant not found" });
  const menuItems = await MenuItem.find({ _id: { $in: items.map(item => item.menuItemId) }, restaurantId, available: { $ne: false } }).select("_id name pricePaise").lean();
  if (menuItems.length !== items.length) return res.status(400).json({ error: "One or more dishes are no longer available" });
  const byId = new Map(menuItems.map(item => [String(item._id), item]));
  const safeItems = items.map(item => {
    const menuItem = byId.get(item.menuItemId);
    return { menuItemId: menuItem._id, name: menuItem.name, pricePaise: menuItem.pricePaise, quantity: item.quantity, note: item.note };
  });
  const cart = await CustomerCart.findOneAndUpdate(
    { customerId: req.user._id },
    { $set: { restaurantId: restaurant._id, items: safeItems } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return res.json({ cart: { restaurantId: String(cart.restaurantId), items: cart.items } });
}

async function clearCart(req, res) {
  await CustomerCart.deleteOne({ customerId: req.user._id });
  return res.status(204).end();
}

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
  const alMadina = await Restaurant.findOne({ name: /^Al-Madina$/i, status: "approved" }).select("_id").lean();
  const user = await User.findById(req.user._id).select("loyaltyStampsRedeemed").lean();
  const deliveredOrders = alMadina
    ? await Order.countDocuments({ customerId: req.user._id, restaurantId: alMadina._id, status: "delivered" })
    : 0;
  const stampsRedeemed = Math.max(0, Number(user?.loyaltyStampsRedeemed) || 0);
  const stampsAvailable = Math.max(0, deliveredOrders - stampsRedeemed);
  const stampsPerReward = 20;
  const rewardPercent = 20;

  return res.json({
    loyalty: {
      deliveredOrders,
      stampsEarned: deliveredOrders,
      stampsRedeemed,
      stampsAvailable,
      availableRewards: Math.floor(stampsAvailable / stampsPerReward),
      stampsTowardNextReward: stampsAvailable % stampsPerReward,
      stampsPerReward,
      rewardPercent,
      rewardMessage: "Get 1 stamp for every delivered order. Redeem 20 stamps for 20% off one order."
    }
  });
}

async function listFavouriteRestaurants(req, res) {
  const [user, alMadina] = await Promise.all([
    User.findById(req.user._id).select("favoriteRestaurantIds").lean(),
    Restaurant.findOne({ name: /^Al-Madina$/i, status: "approved" }).select("_id").lean()
  ]);
  const favorites = (user?.favoriteRestaurantIds || []).map(String);
  return res.json({ restaurantIds: alMadina && favorites.includes(String(alMadina._id)) ? [String(alMadina._id)] : [] });
}

async function addFavouriteRestaurant(req, res) {
  if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.status(400).json({ error: "Invalid restaurant" });
  const restaurant = await Restaurant.findOne({ _id: req.params.restaurantId, name: /^Al-Madina$/i, status: "approved" }).select("_id").lean();
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  await User.updateOne({ _id: req.user._id }, { $addToSet: { favoriteRestaurantIds: restaurant._id } });
  return res.status(204).end();
}

async function removeFavouriteRestaurant(req, res) {
  if (!mongoose.isValidObjectId(req.params.restaurantId)) return res.status(400).json({ error: "Invalid restaurant" });
  await User.updateOne({ _id: req.user._id }, { $pull: { favoriteRestaurantIds: req.params.restaurantId } });
  return res.status(204).end();
}

module.exports = { getCart, saveCart, clearCart, listAddresses, addAddress, deleteAddress, getLoyaltySummary, listFavouriteRestaurants, addFavouriteRestaurant, removeFavouriteRestaurant };
