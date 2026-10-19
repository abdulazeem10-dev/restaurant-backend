const bcrypt = require("bcrypt");
const { z } = require("zod");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");

const deliveryPartnerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32).transform(value => value.replace(/[\s().-]/g, "")).pipe(z.string().max(15).regex(/^\+?[1-9]\d{7,14}$/)),
  password: z.string().min(12).max(128)
}).strict();

async function createDeliveryPartner(req, res) {
  const parsed = deliveryPartnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a name, valid email, phone number, and password of at least 12 characters" });
  const email = parsed.data.email.toLowerCase();
  if (await User.findOne({ email })) return res.status(409).json({ error: "An account already uses this email" });
  const partner = await User.create({
    name: parsed.data.name,
    email,
    phone: parsed.data.phone,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    role: "delivery",
    status: "active"
  });
  return res.status(201).json({ deliveryPartner: { id: partner._id, name: partner.name, email: partner.email, phone: partner.phone } });
}

const restaurantImageUrlSchema = z.string().trim().max(2048).optional().default("").refine(value => {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Image URL must be a valid HTTPS URL");

const createSchema = z.object({
  ownerName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  restaurantName: z.string().trim().min(1).max(150),
  description: z.string().max(2000).optional().default(""),
  address: z.string().trim().min(5).max(500),
  imageUrl: restaurantImageUrlSchema,
  foodType: z.enum(["veg", "nonVeg", "both"]).optional().default("both")
}).strict();

async function createRestaurant(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid restaurant or owner details" });
  const email = parsed.data.email.toLowerCase();
  if (await User.findOne({ email })) return res.status(409).json({ error: "An account already uses this email" });

  const owner = await User.create({
    name: parsed.data.ownerName,
    email,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    role: "restaurant",
    status: "active"
  });
  try {
    const restaurant = await Restaurant.create({
      ownerId: owner._id,
      name: parsed.data.restaurantName,
      description: parsed.data.description,
      address: parsed.data.address,
      imageUrl: parsed.data.imageUrl,
      foodType: parsed.data.foodType,
      status: "pending",
      isOpen: false
    });
    return res.status(201).json({ restaurant, owner: { id: owner._id, name: owner.name, email: owner.email } });
  } catch (error) {
    await User.deleteOne({ _id: owner._id });
    throw error;
  }
}

async function listRestaurants(req, res) {
  const restaurants = await Restaurant.find().populate("ownerId", "name email status").sort({ createdAt: -1 }).limit(200);
  return res.json({ restaurants });
}

async function setRestaurantStatus(req, res) {
  if (!['approved', 'rejected', 'suspended'].includes(req.body?.status)) {
    return res.status(400).json({ error: "Invalid restaurant status" });
  }
  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { $set: { status: req.body.status, ...(req.body.status !== "approved" ? { isOpen: false } : {}) } },
    { new: true, runValidators: true }
  );
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ restaurant });
}

async function setRestaurantImage(req, res) {
  const parsed = z.object({ imageUrl: restaurantImageUrlSchema }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Image URL must be a valid HTTPS URL" });

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { $set: { imageUrl: parsed.data.imageUrl } },
    { new: true, runValidators: true }
  );
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ restaurant });
}

async function setRestaurantFoodType(req, res) {
  const parsed = z.object({ foodType: z.enum(["veg", "nonVeg", "both"]) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose Veg, Non-Veg, or Both" });

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { $set: { foodType: parsed.data.foodType } },
    { new: true, runValidators: true }
  );
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  return res.json({ restaurant });
}

module.exports = { createRestaurant, listRestaurants, setRestaurantStatus, setRestaurantImage, setRestaurantFoodType, createDeliveryPartner };
