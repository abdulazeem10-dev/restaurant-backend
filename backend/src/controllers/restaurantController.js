const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");

async function listRestaurants(req, res) {
  const restaurants = await Restaurant.find({
    status: "approved",
    isOpen: true
  }).select("name description address isOpen").sort({ name: 1 }).limit(100);

  res.json({ restaurants });
}

async function getRestaurant(req, res) {
  const restaurant = await Restaurant.findOne({
    _id: req.params.id,
    status: "approved"
  }).select("name description address isOpen");

  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ restaurant });
}

async function getPublicMenu(req, res) {
  const restaurant = await Restaurant.findOne({
    _id: req.params.id,
    status: "approved"
  }).select("_id");

  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const items = await MenuItem.find({
    restaurantId: restaurant._id,
    available: true
  }).select("name description imageUrl pricePaise category available").sort({ category: 1, name: 1 });

  return res.json({ items });
}

async function getOwnedRestaurant(userId) {
  return Restaurant.findOne({ ownerId: userId });
}

async function setOwnOpenStatus(req, res) {
  if (typeof req.body?.isOpen !== "boolean") return res.status(400).json({ error: "isOpen must be true or false" });
  const restaurant = await getOwnedRestaurant(req.user._id);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (restaurant.status !== "approved" && req.body.isOpen) return res.status(403).json({ error: "Restaurant must be approved before opening" });
  restaurant.isOpen = req.body.isOpen;
  await restaurant.save();
  return res.json({ restaurant: { id: restaurant._id, name: restaurant.name, isOpen: restaurant.isOpen, status: restaurant.status } });
}

async function getOwnMenu(req, res) {
  const restaurant = await getOwnedRestaurant(req.user._id);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const items = await MenuItem.find({ restaurantId: restaurant._id }).sort({ createdAt: -1 });
  return res.json({ restaurant: { id: restaurant._id, name: restaurant.name, isOpen: restaurant.isOpen, status: restaurant.status }, items });
}

async function createMenuItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user._id);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (restaurant.status !== "approved") return res.status(403).json({ error: "Restaurant is not approved" });

  const { name, description = "", imageUrl = "", pricePaise, category, available = true } = req.body || {};
  let validImageUrl = imageUrl === "";
  if (typeof imageUrl === "string" && imageUrl.length <= 2048 && imageUrl.trim()) {
    try {
      validImageUrl = new URL(imageUrl).protocol === "https:";
    } catch {
      validImageUrl = false;
    }
  }
  if (typeof name !== "string" || !name.trim() || name.length > 150 ||
      typeof category !== "string" || !category.trim() || category.length > 80 ||
      !Number.isSafeInteger(pricePaise) || pricePaise < 1 ||
      typeof description !== "string" || description.length > 1000 ||
      typeof imageUrl !== "string" || !validImageUrl ||
      typeof available !== "boolean") {
    return res.status(400).json({ error: "Invalid menu item details" });
  }

  const item = await MenuItem.create({
    restaurantId: restaurant._id,
    name: name.trim(),
    description: description.trim(),
    imageUrl: imageUrl.trim(),
    pricePaise,
    category: category.trim(),
    available
  });

  return res.status(201).json({ item });
}

async function updateMenuItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user._id);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const allowed = ["name", "description", "imageUrl", "pricePaise", "category", "available"];
  const input = req.body || {};
  if (Object.keys(input).length === 0 || Object.keys(input).some(key => !allowed.includes(key))) {
    return res.status(400).json({ error: "Invalid fields" });
  }
  if (input.pricePaise !== undefined && (!Number.isSafeInteger(input.pricePaise) || input.pricePaise < 1)) {
    return res.status(400).json({ error: "Invalid price" });
  }
  if (input.available !== undefined && typeof input.available !== "boolean") {
    return res.status(400).json({ error: "Invalid availability" });
  }
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.length > 150)) {
    return res.status(400).json({ error: "Invalid name" });
  }
  if (input.category !== undefined && (typeof input.category !== "string" || !input.category.trim() || input.category.length > 80)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 1000)) {
    return res.status(400).json({ error: "Invalid description" });
  }
  if (input.imageUrl !== undefined) {
    if (typeof input.imageUrl !== "string" || input.imageUrl.length > 2048) {
      return res.status(400).json({ error: "Invalid dish image URL" });
    }
    if (input.imageUrl.trim()) {
      try {
        if (new URL(input.imageUrl).protocol !== "https:") throw new Error("Invalid protocol");
      } catch {
        return res.status(400).json({ error: "Dish image must use a valid HTTPS URL" });
      }
    }
    input.imageUrl = input.imageUrl.trim();
  }

  const item = await MenuItem.findOneAndUpdate(
    { _id: req.params.id, restaurantId: restaurant._id },
    { $set: input },
    { new: true, runValidators: true }
  );

  if (!item) return res.status(404).json({ error: "Menu item not found" });
  return res.json({ item });
}

async function deleteMenuItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user._id);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const item = await MenuItem.findOneAndDelete({
    _id: req.params.id,
    restaurantId: restaurant._id
  });

  if (!item) return res.status(404).json({ error: "Menu item not found" });
  return res.status(204).end();
}

module.exports = {
  listRestaurants, getRestaurant, getPublicMenu,
  getOwnMenu, createMenuItem, updateMenuItem, deleteMenuItem, setOwnOpenStatus
};
