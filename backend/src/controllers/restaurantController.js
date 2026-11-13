const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const GroceryStock = require("../models/GroceryStock");
const Review = require("../models/Review");
const { z } = require("zod");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const Subscription = require("../models/Subscription");
const { PLAN_TIERS, accountLimitFor, normalizePlanTier } = require("../utils/subscriptionPlans");
const { SUBSCRIPTIONS_ENABLED } = require("../config/features");
const { WEEKDAYS, isRestaurantOpenNow } = require("../utils/openingHours");

const timeSchema = z.string().length(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const cuisineSchema = z.enum(["north-indian", "pizza", "chinese", "desserts", "burger", "biryani", "south-indian", "noodles", "rolls", "shawarma", "vada", "dosa", "momo", "salads", "other"]);
const dailyHoursSchema = z.object({
  closed: z.boolean(),
  opensAt: timeSchema,
  closesAt: timeSchema
}).strict().superRefine((hours, context) => {
  if (!hours.closed && hours.closesAt === hours.opensAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Opening and closing times cannot be the same" });
  }
});
const openingHoursInputSchema = z.object(Object.fromEntries(
  WEEKDAYS.map(day => [day, dailyHoursSchema])
)).strict();
const deliveryAreaInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pincodes: z.array(z.string().length(6).regex(/^\d{6}$/)).min(1).max(100)
}).strict();
const groceryDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid date");
const groceryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60).optional().default("Other"),
  quantity: z.number().finite().min(0).max(10000000),
  unit: z.string().trim().min(1).max(24),
  lowStockThreshold: z.number().finite().min(0).max(10000000),
  receivedDate: groceryDateSchema,
  expiryDate: groceryDateSchema.nullable().optional().default(null),
  supplier: z.string().trim().max(120).optional().default(""),
  purchaseTotalPaise: z.number().int().safe().min(0).max(1000000000).optional().default(0),
  paymentMethod: z.enum(["cash", "upi", "card", "bank_transfer", "credit", "other"]),
  notes: z.string().trim().max(500).optional().default("")
}).strict();
const serviceSettingsSchema = z.object({
  openingHours: openingHoursInputSchema.optional(),
  deliveryPincodes: z.array(z.string().length(6).regex(/^\d{6}$/)).max(100).optional(),
  deliveryAreas: z.array(deliveryAreaInputSchema).max(50).optional(),
  cuisine: cuisineSchema.optional(),
  prepTimeMinutes: z.number().int().min(5).max(180).optional(),
  deliveryTimeMinutes: z.number().int().min(5).max(180).optional(),
  dineInTableCount: z.number().int().min(1).max(500).optional()
}).strict().superRefine((value, context) => {
  if (value.openingHours === undefined && value.deliveryPincodes === undefined && value.deliveryAreas === undefined && value.cuisine === undefined && value.prepTimeMinutes === undefined && value.deliveryTimeMinutes === undefined && value.dineInTableCount === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "At least one setting is required" });
  }
  if (value.deliveryAreas !== undefined) {
    const names = value.deliveryAreas.map(area => area.name.toLocaleLowerCase());
    if (new Set(names).size !== names.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryAreas"], message: "Each delivery area needs a unique name" });
    const pincodes = value.deliveryAreas.flatMap(area => area.pincodes);
    if (pincodes.length > 100) context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryAreas"], message: "Add no more than 100 PIN codes across all areas" });
    if (new Set(pincodes).size !== pincodes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryAreas"], message: "A PIN code can belong to only one delivery area" });
  }
});
const restaurantStaffSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(20).optional().default(""),
  password: z.string().min(12).max(128),
  staffRole: z.enum(["secondary_admin", "biller_modifier", "viewer"])
}).strict();

const cuisineByMenuCategory = new Map([
  ["north-indian", "north-indian"], ["northindian", "north-indian"],
  ["pizza", "pizza"], ["pizzas", "pizza"],
  ["chinese", "chinese"], ["indo-chinese", "chinese"], ["indochinese", "chinese"],
  ["dessert", "desserts"], ["desserts", "desserts"], ["sweets", "desserts"],
  ["burger", "burger"], ["burgers", "burger"],
  ["biryani", "biryani"], ["biriyani", "biryani"],
  ["south-indian", "south-indian"], ["southindian", "south-indian"],
  ["noodle", "noodles"], ["noodles", "noodles"],
  ["roll", "rolls"], ["rolls", "rolls"],
  ["shawarma", "shawarma"],
  ["vada", "vada"], ["vada-pav", "vada"], ["vadapav", "vada"],
  ["dosa", "dosa"], ["dosas", "dosa"],
  ["momo", "momo"], ["momos", "momo"],
  ["salad", "salads"], ["salads", "salads"]
]);

function cuisineForMenuCategory(category) {
  const normalized = String(category || "").trim().toLocaleLowerCase().replace(/[\s_]+/g, "-");
  return cuisineByMenuCategory.get(normalized);
}

const AL_MADINA_RESTAURANT_NAME = /^al[\s-]?madina(?:\s+family\s+restaurant)?$/i;

async function listRestaurants(req, res) {
  // The customer storefront belongs to Al-Madina. Admin-managed
  // restaurant records must never turn this public endpoint into a directory.
  const query = { status: "approved", name: AL_MADINA_RESTAURANT_NAME };
  const approvedRestaurants = await Restaurant.find(query)
    .select("name description address imageUrl foodType cuisine isOpen openingHours deliveryPincodes deliveryAreas prepTimeMinutes deliveryTimeMinutes")
    .sort({ name: 1 }).limit(100).lean();
  const activeSubscriptions = SUBSCRIPTIONS_ENABLED ? await Subscription.find({
    restaurantId: { $in: approvedRestaurants.map(restaurant => restaurant._id) },
    status: "active",
    currentPeriodEnd: { $gt: new Date() }
  }).select("restaurantId").lean() : [];
  const paidRestaurantIds = new Set(activeSubscriptions.map(item => String(item.restaurantId)));
  const restaurants = SUBSCRIPTIONS_ENABLED ? approvedRestaurants.filter(restaurant => paidRestaurantIds.has(String(restaurant._id))) : approvedRestaurants;
  const ratingStats = await Review.aggregate([
    { $match: { restaurantId: { $in: restaurants.map(restaurant => restaurant._id) } } },
    { $group: { _id: "$restaurantId", ratingAverage: { $avg: "$rating" }, ratingCount: { $sum: 1 } } }
  ]);
  const ratingByRestaurant = new Map(ratingStats.map(stats => [String(stats._id), stats]));
  const menuCategories = await MenuItem.aggregate([
    { $match: { restaurantId: { $in: restaurants.map(restaurant => restaurant._id) }, available: { $ne: false }, $or: [{ stockTracked: { $ne: true } }, { stockQuantity: { $gt: 0 } }] } },
    { $group: {
      _id: "$restaurantId",
      categories: { $addToSet: "$category" },
      lowestPricePaise: { $min: "$pricePaise" }
    } }
  ]);
  const featuredItems = await MenuItem.find({ restaurantId: { $in: restaurants.map(restaurant => restaurant._id) }, available: { $ne: false }, $or: [{ stockTracked: { $ne: true } }, { stockQuantity: { $gt: 0 } }] })
    .select("name imageUrl pricePaise category foodType restaurantId")
    .sort({ createdAt: -1, _id: -1 })
    .limit(32)
    .lean();
  const cuisinesByRestaurant = new Map(menuCategories.map(({ _id, categories }) => [
    String(_id), [...new Set(categories.map(cuisineForMenuCategory).filter(Boolean))]
  ]));
  const lowestPriceByRestaurant = new Map(menuCategories.map(({ _id, lowestPricePaise }) => [String(_id), lowestPricePaise]));
  const restaurantById = new Map(restaurants.map(restaurant => [String(restaurant._id), restaurant]));

  return res.json({
    restaurants: restaurants.map(restaurant => ({
    ...restaurant,
    cuisines: [...new Set([
      ...(cuisinesByRestaurant.get(String(restaurant._id)) || []),
      ...(restaurant.cuisine && restaurant.cuisine !== "other" ? [restaurant.cuisine] : [])
    ])],
    lowestPricePaise: lowestPriceByRestaurant.get(String(restaurant._id)) ?? null,
    isOpen: isRestaurantOpenNow(restaurant),
    ratingAverage: ratingByRestaurant.get(String(restaurant._id))?.ratingAverage || 0,
    ratingCount: ratingByRestaurant.get(String(restaurant._id))?.ratingCount || 0
    })),
    featuredDishes: featuredItems.map(item => ({
      _id: item._id,
      name: item.name,
      imageUrl: item.imageUrl,
      pricePaise: item.pricePaise,
      category: item.category,
      foodType: item.foodType,
      restaurantId: item.restaurantId,
      restaurantName: restaurantById.get(String(item.restaurantId))?.name || "Local restaurant",
      cuisine: cuisineForMenuCategory(item.category) || "other"
    }))
  });
}

async function getRestaurant(req, res) {
  const restaurant = await Restaurant.findOne({
    _id: req.params.id,
    name: AL_MADINA_RESTAURANT_NAME,
    status: "approved"
  }).select("name description address imageUrl foodType cuisine isOpen openingHours deliveryPincodes deliveryAreas prepTimeMinutes deliveryTimeMinutes").lean();

  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (SUBSCRIPTIONS_ENABLED && !await Subscription.exists({ restaurantId: restaurant._id, status: "active", currentPeriodEnd: { $gt: new Date() } })) return res.status(404).json({ error: "Restaurant not found" });
  const [stats] = await Review.aggregate([
    { $match: { restaurantId: restaurant._id } },
    { $group: { _id: null, ratingAverage: { $avg: "$rating" }, ratingCount: { $sum: 1 } } }
  ]);
  return res.json({ restaurant: {
    ...restaurant,
    isOpen: isRestaurantOpenNow(restaurant),
    ratingAverage: stats?.ratingAverage || 0,
    ratingCount: stats?.ratingCount || 0
  } });
}

async function getPublicMenu(req, res) {
  const restaurant = await Restaurant.findOne({
    _id: req.params.id,
    name: AL_MADINA_RESTAURANT_NAME,
    status: "approved"
  }).select("_id");

  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (SUBSCRIPTIONS_ENABLED && !await Subscription.exists({ restaurantId: restaurant._id, status: "active", currentPeriodEnd: { $gt: new Date() } })) return res.status(404).json({ error: "Restaurant not found" });

  const items = await MenuItem.find({
    restaurantId: restaurant._id,
    // Older menu records may not have the availability field yet. Treat only
    // an explicit false as sold out so previously saved dishes remain listed.
    available: { $ne: false },
    $or: [{ stockTracked: { $ne: true } }, { stockQuantity: { $gt: 0 } }]
  }).select("name description imageUrl pricePaise category foodType available").sort({ category: 1, name: 1 });

  return res.json({ items });
}

async function getOwnedRestaurant(user) {
  if (user.role === "restaurant_staff") return Restaurant.findById(user.restaurantId);
  return Restaurant.findOne({ ownerId: user._id });
}

function quotaError(message, code, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function getRestaurantAccountQuota(restaurantId, session = null) {
  let subscriptionQuery = Subscription.findOne({ restaurantId }).sort({ currentPeriodEnd: -1 });
  let countQuery = User.countDocuments({
    restaurantId,
    role: { $in: ["restaurant_staff", "delivery"] },
    status: "active",
    profileDeactivatedAt: null
  });
  if (session) {
    subscriptionQuery = subscriptionQuery.session(session);
    countQuery = countQuery.session(session);
  }
  const [subscription, staffAndDelivery] = await Promise.all([subscriptionQuery, countQuery]);
  const active = !SUBSCRIPTIONS_ENABLED || Boolean(subscription && subscription.status === "active" && subscription.currentPeriodEnd > new Date());
  const planTier = SUBSCRIPTIONS_ENABLED && subscription ? normalizePlanTier(subscription.planTier) : null;
  const maxAccounts = active ? (SUBSCRIPTIONS_ENABLED ? accountLimitFor(planTier) : accountLimitFor("gold")) : 0;
  return {
    planTier,
    termYears: subscription?.termYears || null,
    active,
    totalAccounts: 1 + staffAndDelivery,
    maxAccounts,
    remainingAccounts: Math.max(0, maxAccounts - 1 - staffAndDelivery)
  };
}

async function createRestaurantAccountWithinQuota(restaurantId, accountDetails) {
  const session = await mongoose.startSession();
  let account;
  let quota;
  try {
    await session.withTransaction(async () => {
      let subscription = null;
      if (SUBSCRIPTIONS_ENABLED) {
        [subscription] = await Subscription.find({ restaurantId }).sort({ currentPeriodEnd: -1 }).limit(1).session(session);
        if (!subscription || subscription.status !== "active" || !subscription.currentPeriodEnd || subscription.currentPeriodEnd <= new Date()) {
          throw quotaError("Choose and pay for a subscription before creating staff or delivery accounts.", "subscription_required", 403);
        }
      }
      const planTier = SUBSCRIPTIONS_ENABLED ? normalizePlanTier(subscription.planTier) : "gold";
      const maxAccounts = accountLimitFor(planTier);
      const activeAccounts = await User.countDocuments({ restaurantId, role: { $in: ["restaurant_staff", "delivery"] }, status: "active", profileDeactivatedAt: null }).session(session);
      const totalAccounts = await User.countDocuments({ email: accountDetails.email }).session(session);
      const used = 1 + activeAccounts; // The restaurant owner is always one of the plan's seats.
      quota = { planTier, active: true, totalAccounts: used, maxAccounts, remainingAccounts: Math.max(0, maxAccounts - used) };
      if (totalAccounts) throw quotaError("An account already uses this email", "email_in_use");
      if (used >= maxAccounts) throw quotaError("The total account limit has been reached. Deactivate an account to add another.", "account_limit_reached");

      // Every seat allocation writes the same subscription document inside the
      // transaction. Concurrent account creation therefore conflicts and is
      // retried by MongoDB before the account cap can be exceeded.
      if (SUBSCRIPTIONS_ENABLED) await Subscription.updateOne({ _id: subscription._id }, { $inc: { seatRevision: 1 } }, { session });
      const [created] = await User.create([accountDetails], { session });
      account = created;
      quota = { ...quota, totalAccounts: used + 1, remainingAccounts: Math.max(0, maxAccounts - used - 1) };
    });
    return { account, quota };
  } finally {
    await session.endSession();
  }
}

const deliveryPartnerSchema = z.object({
 name:z.string().trim().min(1).max(100),email:z.string().trim().email().max(254),
 phone:z.string().trim().max(32).transform(v=>v.replace(/[\s().-]/g,"")).pipe(z.string().max(15).regex(/^\+?[1-9]\d{7,14}$/)),
 password:z.string().min(12).max(128)
}).strict();
const deliveryPartnerProfileSchema=z.object({
 name:z.string().trim().min(1).max(100),email:z.string().trim().email().max(254),
 phone:z.string().trim().max(32).transform(v=>v.replace(/[\s().-]/g,"")).pipe(z.string().max(15).regex(/^$|^\+?[1-9]\d{7,14}$/))
}).strict();
const deliveryProfileStatusSchema=z.object({active:z.boolean()}).strict();
async function listOwnDeliveryPartners(req,res){
 const restaurant=await getOwnedRestaurant(req.user);if(!restaurant)return res.status(404).json({error:"Restaurant not found"});
 const [deliveryPartners, quota]=await Promise.all([User.find({restaurantId:restaurant._id,role:"delivery"}).select("name email phone status profileDeactivatedAt createdAt").sort({createdAt:-1}).limit(200).lean(),getRestaurantAccountQuota(restaurant._id)]);return res.json({deliveryPartners,quota});
}
async function createOwnDeliveryPartner(req,res){
 const parsed=deliveryPartnerSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Enter a name, valid email, phone number, and password of at least 12 characters"});
 const restaurant=await getOwnedRestaurant(req.user);if(!restaurant)return res.status(404).json({error:"Restaurant not found"});const email=parsed.data.email.toLowerCase();
 try {
  const {account:partner,quota}=await createRestaurantAccountWithinQuota(restaurant._id,{name:parsed.data.name,email,phone:parsed.data.phone,passwordHash:await bcrypt.hash(parsed.data.password,12),role:"delivery",restaurantId:restaurant._id,status:"active"});
  return res.status(201).json({deliveryPartner:{id:partner._id,name:partner.name,email:partner.email,phone:partner.phone},quota});
 } catch(error) { if(error.code===11000||error.code==="email_in_use")return res.status(409).json({error:"An account already uses this email"}); if(error.code==="account_limit_reached"||error.code==="subscription_required")return res.status(error.status||409).json({error:error.message,code:error.code,quota:await getRestaurantAccountQuota(restaurant._id)}); throw error; }
}
async function updateOwnDeliveryPartner(req,res){
 const restaurant=await getOwnedRestaurant(req.user);if(!restaurant)return res.status(404).json({error:"Restaurant not found"});
 const parsed=deliveryPartnerProfileSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Enter a name, valid email, and valid phone number"});
 const partner=await User.findOne({_id:req.params.id,restaurantId:restaurant._id,role:"delivery"});if(!partner)return res.status(404).json({error:"Delivery account not found"});
 partner.name=parsed.data.name;partner.email=parsed.data.email.toLowerCase();partner.phone=parsed.data.phone;
 try{await partner.save()}catch(error){if(error.code===11000)return res.status(409).json({error:"Another account already uses this email / login"});throw error}
 return res.json({deliveryPartner:{id:partner._id,name:partner.name,email:partner.email,phone:partner.phone}});
}
async function setOwnDeliveryPartnerProfileStatus(req,res){
 const parsed=deliveryProfileStatusSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Choose whether to activate or deactivate the account"});
 const restaurant=await getOwnedRestaurant(req.user);if(!restaurant)return res.status(404).json({error:"Restaurant not found"});
 const partner=await User.findOne({_id:req.params.id,restaurantId:restaurant._id,role:"delivery"});if(!partner)return res.status(404).json({error:"Delivery account not found"});
 if(parsed.data.active){
  if(!partner.profileDeactivatedAt)return res.status(409).json({error:"This account is not deactivated"});
  const session=await mongoose.startSession();
  try{
   await session.withTransaction(async()=>{
    let subscription=null;
    if(SUBSCRIPTIONS_ENABLED){
     [subscription]=await Subscription.find({restaurantId:restaurant._id}).sort({currentPeriodEnd:-1}).limit(1).session(session);
     if(!subscription||subscription.status!=="active"||!subscription.currentPeriodEnd||subscription.currentPeriodEnd<=new Date())throw quotaError("An active subscription is required to restore this login.","subscription_required",403);
    }
    const tier=SUBSCRIPTIONS_ENABLED?normalizePlanTier(subscription.planTier):"gold",max=accountLimitFor(tier);
    const used=1+await User.countDocuments({restaurantId:restaurant._id,role:{$in:["restaurant_staff","delivery"]},status:"active",profileDeactivatedAt:null}).session(session);
    if(used>=max)throw quotaError("The total account limit has been reached. Deactivate another login first.","account_limit_reached");
    if(SUBSCRIPTIONS_ENABLED)await Subscription.updateOne({_id:subscription._id},{$inc:{seatRevision:1}},{session});
    const current=await User.findOne({_id:partner._id,restaurantId:restaurant._id,role:"delivery"}).session(session);
    if(!current||!current.profileDeactivatedAt)throw quotaError("This account is not deactivated","account_state_changed");
    current.status=current.statusBeforeProfileDeactivation||"active";current.profileDeactivatedAt=null;current.statusBeforeProfileDeactivation=null;await current.save({session});
    partner.status=current.status;partner.profileDeactivatedAt=null;
   });
  }catch(error){if(error.code==="account_limit_reached"||error.code==="subscription_required")return res.status(error.status||409).json({error:error.message,code:error.code,quota:await getRestaurantAccountQuota(restaurant._id)});throw error}
  finally{await session.endSession()}
 } else {
  if(partner.profileDeactivatedAt)return res.status(409).json({error:"This account is already deactivated"});
  partner.statusBeforeProfileDeactivation=partner.status;partner.status="suspended";partner.profileDeactivatedAt=new Date();await partner.save();
 }
 return res.json({deliveryPartner:{id:partner._id,status:partner.status,profileDeactivatedAt:partner.profileDeactivatedAt},quota:await getRestaurantAccountQuota(restaurant._id)});
}

async function listOwnStaff(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const [accounts, quota] = await Promise.all([
    User.find({ restaurantId: restaurant._id, role: "restaurant_staff" }).select("name email phone restaurantStaffRole status").sort({ restaurantStaffRole: 1 }).lean(),
    getRestaurantAccountQuota(restaurant._id)
  ]);
  return res.json({ accounts, quota });
}

async function createOwnStaff(req, res) {
  const parsed = restaurantStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a name, valid email, password of at least 12 characters, and a valid staff role" });
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const email = parsed.data.email.toLowerCase();
  if (await User.findOne({ restaurantId: restaurant._id, restaurantStaffRole: parsed.data.staffRole, role: "restaurant_staff" })) {
    return res.status(409).json({ error: "This restaurant already has an account for that role" });
  }
  try {
    const { account, quota } = await createRestaurantAccountWithinQuota(restaurant._id, {
      name: parsed.data.name,
      email,
      phone: parsed.data.phone,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: "restaurant_staff",
      restaurantId: restaurant._id,
      restaurantStaffRole: parsed.data.staffRole,
      status: "active"
    });
    return res.status(201).json({ account: { id: account._id, name: account.name, email: account.email, phone: account.phone, staffRole: account.restaurantStaffRole }, quota });
  } catch (error) {
    if (error.code === 11000 || error.code === "email_in_use") return res.status(409).json({ error: "That role or email already has an account" });
    if (error.code === "account_limit_reached" || error.code === "subscription_required") return res.status(error.status || 409).json({ error: error.message, code: error.code, quota: await getRestaurantAccountQuota(restaurant._id) });
    throw error;
  }
}

async function removeOwnStaff(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const account = await User.findOneAndDelete({ _id: req.params.staffId, restaurantId: restaurant._id, role: "restaurant_staff" }).select("_id");
  if (!account) return res.status(404).json({ error: "Restaurant staff account not found" });
  return res.status(204).end();
}

async function getOwnSubscription(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const subscription = await Subscription.findOne({ restaurantId: restaurant._id }).sort({ currentPeriodEnd: -1 }).lean();
  const quota = await getRestaurantAccountQuota(restaurant._id);
  return res.json({
    subscription: subscription ? { planTier: normalizePlanTier(subscription.planTier), termYears: subscription.termYears, status: subscription.status, currentPeriodStart: subscription.currentPeriodStart, currentPeriodEnd: subscription.currentPeriodEnd, renewalRequest: subscription.renewalRequest || { status: "none" } } : null,
    quota,
    plans: Object.entries(PLAN_TIERS).map(([planTier, config]) => ({ planTier, maxAccounts: config.maxAccounts }))
  });
}

async function setOwnOpenStatus(req, res) {
  if (typeof req.body?.isOpen !== "boolean") return res.status(400).json({ error: "isOpen must be true or false" });
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (restaurant.status !== "approved" && req.body.isOpen) return res.status(403).json({ error: "Restaurant must be approved before opening" });
  restaurant.isOpen = req.body.isOpen;
  await restaurant.save();
  return res.json({ restaurant: { id: restaurant._id, name: restaurant.name, isOpen: restaurant.isOpen, status: restaurant.status } });
}

async function updateOwnServiceSettings(req, res) {
  const parsed = serviceSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter valid opening hours and delivery areas with unique names and 6-digit PIN codes" });

  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (parsed.data.openingHours) restaurant.openingHours = parsed.data.openingHours;
  if (parsed.data.deliveryAreas !== undefined) {
    restaurant.deliveryAreas = parsed.data.deliveryAreas.map(area => ({ name: area.name.trim(), pincodes: [...new Set(area.pincodes)] }));
    restaurant.deliveryPincodes = [...new Set(restaurant.deliveryAreas.flatMap(area => area.pincodes))];
  } else if (parsed.data.deliveryPincodes !== undefined) {
    restaurant.deliveryPincodes = [...new Set(parsed.data.deliveryPincodes)];
    restaurant.deliveryAreas = [];
  }
  if (parsed.data.cuisine) restaurant.cuisine = parsed.data.cuisine;
  if (parsed.data.prepTimeMinutes !== undefined) restaurant.prepTimeMinutes = parsed.data.prepTimeMinutes;
  if (parsed.data.deliveryTimeMinutes !== undefined) restaurant.deliveryTimeMinutes = parsed.data.deliveryTimeMinutes;
  if (parsed.data.dineInTableCount !== undefined) restaurant.dineInTableCount = parsed.data.dineInTableCount;
  await restaurant.save();
  return res.json({
    restaurant: {
      id: restaurant._id,
      openingHours: restaurant.openingHours,
      deliveryPincodes: restaurant.deliveryPincodes,
      deliveryAreas: restaurant.deliveryAreas,
      cuisine: restaurant.cuisine || "other",
      prepTimeMinutes: restaurant.prepTimeMinutes,
      deliveryTimeMinutes: restaurant.deliveryTimeMinutes,
      dineInTableCount: restaurant.dineInTableCount
    }
  });
}

async function getOwnReports(req, res) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const fromText = req.query.from;
  const toText = req.query.to;
  if (typeof fromText !== "string" || typeof toText !== "string" || fromText.length !== 10 || toText.length !== 10 || !datePattern.test(fromText) || !datePattern.test(toText)) {
    return res.status(400).json({ error: "Choose a valid report date range" });
  }
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T00:00:00.000Z`);
  const rangeDays = (to - from) / 86_400_000;
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.toISOString().slice(0, 10) !== fromText || to.toISOString().slice(0, 10) !== toText || !Number.isFinite(rangeDays) || rangeDays < 0 || rangeDays > 365) return res.status(400).json({ error: "Choose a valid date range of up to 366 days" });
  const end = new Date(to.getTime() + 86_400_000);
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const match = { restaurantId: restaurant._id, createdAt: { $gte: from, $lt: end }, status: { $ne: "awaiting_payment" } };
  const [summaryRows, topItems, daily, statusCounts] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        orders: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
        paidSalesPaise: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$paymentStatus", "paid"] }] }, "$totalPaise", 0] } }
      } }
    ]),
    Order.aggregate([
      { $match: { ...match, status: "delivered", paymentStatus: "paid" } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", quantity: { $sum: "$items.quantity" }, salesPaise: { $sum: { $multiply: ["$items.quantity", "$items.unitPricePaise"] } } } },
      { $sort: { quantity: -1, salesPaise: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, name: "$_id", quantity: 1, salesPaise: 1 } }
    ]),
    Order.aggregate([
      { $match: match },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
        orders: { $sum: 1 },
        paidSalesPaise: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "delivered"] }, { $eq: ["$paymentStatus", "paid"] }] }, "$totalPaise", 0] } }
      } },
      { $sort: { _id: 1 } }
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
  ]);
  const summary = summaryRows[0] || { orders: 0, delivered: 0, cancelled: 0, paidSalesPaise: 0 };
  return res.json({ from: fromText, to: toText, summary, topItems, daily, statusCounts });
}

async function updateOwnProfile(req, res) {
  if (req.user?.role === "restaurant_staff") {
    const parsedStaffProfile = z.object({
      restaurantName: z.string().trim().min(1).max(150),
      address: z.string().trim().min(5).max(500)
    }).strict().safeParse(req.body);
    if (!parsedStaffProfile.success) return res.status(400).json({ error: "Enter a restaurant name and valid address" });
    const staffRestaurant = await getOwnedRestaurant(req.user);
    if (!staffRestaurant) return res.status(404).json({ error: "Restaurant not found" });
    staffRestaurant.name = parsedStaffProfile.data.restaurantName;
    staffRestaurant.address = parsedStaffProfile.data.address;
    await staffRestaurant.save();
    return res.json({ restaurant: { id: staffRestaurant._id, name: staffRestaurant.name, address: staffRestaurant.address } });
  }
  const parsed = z.object({
    restaurantName: z.string().trim().min(1).max(150),
    address: z.string().trim().min(5).max(500),
    ownerName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().max(32).transform(value => value.replace(/[\s().-]/g, "")).pipe(z.string().max(15).regex(/^$|^\+?[1-9]\d{7,14}$/))
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a restaurant name, valid address, owner name, valid email, and valid phone number" });
  const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const owner = await User.findOne({ _id: req.user._id, role: "restaurant" });
  if (!owner) return res.status(404).json({ error: "Owner account not found" });
  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email, _id: { $ne: owner._id } })) return res.status(409).json({ error: "Another account already uses this email / login" });
  restaurant.name = parsed.data.restaurantName;
  restaurant.address = parsed.data.address;
  owner.name = parsed.data.ownerName;
  owner.email = email;
  owner.phone = parsed.data.phone;
  try {
    await owner.save();
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "Another account already uses this email / login" });
    throw error;
  }
  await restaurant.save();
  return res.json({ restaurant: { id: restaurant._id, name: restaurant.name, address: restaurant.address }, user: { id: owner._id, name: owner.name, email: owner.email, phone: owner.phone } });
}

async function deactivateOwnProfile(req, res) {
  const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (restaurant.profileDeactivatedAt || req.user.profileDeactivatedAt) return res.status(409).json({ error: "This profile is already deactivated" });
  restaurant.statusBeforeProfileDeactivation = restaurant.status;
  restaurant.status = "suspended";
  restaurant.isOpen = false;
  restaurant.profileDeactivatedAt = new Date();
  req.user.statusBeforeProfileDeactivation = req.user.status;
  req.user.status = "suspended";
  req.user.profileDeactivatedAt = new Date();
  await Promise.all([restaurant.save(), req.user.save()]);
  return res.status(204).end();
}

async function getOwnMenu(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const items = await MenuItem.find({ restaurantId: restaurant._id }).sort({ createdAt: -1 });
  return res.json({
    restaurant: {
      id: restaurant._id,
      name: restaurant.name,
      address: restaurant.address,
      isOpen: restaurant.isOpen,
      isOpenNow: isRestaurantOpenNow(restaurant),
      cuisine: restaurant.cuisine || "other",
      status: restaurant.status,
      openingHours: restaurant.openingHours,
      deliveryPincodes: restaurant.deliveryPincodes,
      deliveryAreas: restaurant.deliveryAreas,
      prepTimeMinutes: restaurant.prepTimeMinutes,
      deliveryTimeMinutes: restaurant.deliveryTimeMinutes,
      dineInTableCount: restaurant.dineInTableCount
    },
    items
  });
}

async function getOwnInventory(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const items = await MenuItem.find({ restaurantId: restaurant._id })
    .select("name category available stockTracked stockQuantity lowStockThreshold")
    .sort({ category: 1, name: 1 });
  const tracked = items.filter(item => item.stockTracked);
  const lowStock = tracked.filter(item => item.stockQuantity <= item.lowStockThreshold).length;
  return res.json({ items, summary: { totalDishes: items.length, trackedDishes: tracked.length, lowStockDishes: lowStock } });
}

function groceryInputError(error) {
  const firstIssue = error.issues?.[0];
  return firstIssue ? `${firstIssue.path.join(" ") || "Inventory details"}: ${firstIssue.message}` : "Invalid grocery stock details";
}

async function listOwnGroceryStock(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const items = await GroceryStock.find({ restaurantId: restaurant._id }).sort({ expiryDate: 1, name: 1, receivedDate: -1 }).limit(1000).lean();
  return res.json({ items });
}

async function createOwnGroceryStock(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const parsed = groceryInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: groceryInputError(parsed.error) });
  const item = await GroceryStock.create({ ...parsed.data, restaurantId: restaurant._id });
  console.log("[grocery-inventory] stock batch created", { restaurantId: String(restaurant._id), itemId: String(item._id), quantity: item.quantity, unit: item.unit });
  return res.status(201).json({ item });
}

async function updateOwnGroceryStock(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Grocery stock entry not found" });
  const parsed = groceryInputSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: groceryInputError(parsed.error) });
  if (!Object.keys(parsed.data).length) return res.status(400).json({ error: "Provide at least one grocery stock field to update" });
  const item = await GroceryStock.findOneAndUpdate(
    { _id: req.params.id, restaurantId: restaurant._id },
    { $set: parsed.data },
    { new: true, runValidators: true }
  );
  if (!item) return res.status(404).json({ error: "Grocery stock entry not found" });
  console.log("[grocery-inventory] stock batch updated", { restaurantId: String(restaurant._id), itemId: String(item._id) });
  return res.json({ item });
}

async function deleteOwnGroceryStock(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Grocery stock entry not found" });
  const item = await GroceryStock.findOneAndDelete({ _id: req.params.id, restaurantId: restaurant._id });
  if (!item) return res.status(404).json({ error: "Grocery stock entry not found" });
  console.log("[grocery-inventory] stock batch deleted", { restaurantId: String(restaurant._id), itemId: String(item._id) });
  return res.status(204).end();
}

async function updateOwnInventoryItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const input = req.body || {};
  const allowed = ["stockTracked", "stockQuantity", "lowStockThreshold"];
  if (!input || Object.keys(input).length === 0 || Object.keys(input).some(key => !allowed.includes(key))) {
    return res.status(400).json({ error: "Provide stock tracking, stock quantity, or low-stock threshold" });
  }
  if (input.stockTracked !== undefined && typeof input.stockTracked !== "boolean") {
    return res.status(400).json({ error: "Stock tracking must be enabled or disabled" });
  }
  for (const field of ["stockQuantity", "lowStockThreshold"]) {
    if (input[field] !== undefined && (!Number.isSafeInteger(input[field]) || input[field] < 0 || input[field] > 1_000_000)) {
      return res.status(400).json({ error: `${field === "stockQuantity" ? "Stock quantity" : "Low-stock threshold"} must be a whole number from 0 to 1,000,000` });
    }
  }
  if (input.stockTracked === true && input.stockQuantity === undefined) {
    return res.status(400).json({ error: "Enter the current stock quantity when enabling tracking" });
  }
  const item = await MenuItem.findOneAndUpdate(
    { _id: req.params.id, restaurantId: restaurant._id },
    { $set: input },
    { new: true, runValidators: true }
  ).select("name category available stockTracked stockQuantity lowStockThreshold");
  if (!item) return res.status(404).json({ error: "Menu item not found" });
  return res.json({ item });
}

async function createMenuItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (restaurant.status !== "approved") return res.status(403).json({ error: "Restaurant is not approved" });

  const { name, description = "", imageUrl = "", pricePaise, category, foodType, available = true } = req.body || {};
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
      !["veg", "nonVeg"].includes(foodType) ||
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
    foodType,
    available
  });

  return res.status(201).json({ item });
}

async function importOwnMenu(req, res) {
  if (req.user?.role !== "restaurant") return res.status(403).json({ error: "Only the restaurant owner can import the printed menu" });
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  if (restaurant.status !== "approved") return res.status(403).json({ error: "Restaurant is not approved" });
  if (String(restaurant.name || "").trim().toLocaleLowerCase() !== "al-madina") {
    return res.status(409).json({ error: "The Al-Madina menu import is only available for the Al-Madina restaurant account" });
  }

  const input = req.body?.items;
  if (!Array.isArray(input) || input.length < 1 || input.length > 400) {
    return res.status(400).json({ error: "Import must contain between 1 and 400 menu items" });
  }
  const valid = input.every(item => item && typeof item === "object" && !Array.isArray(item)
    && typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 150
    && typeof item.category === "string" && item.category.trim().length > 0 && item.category.length <= 80
    && ["veg", "nonVeg"].includes(item.foodType)
    && Number.isSafeInteger(item.pricePaise) && item.pricePaise > 0
    && (item.description === undefined || (typeof item.description === "string" && item.description.length <= 1000)));
  if (!valid) return res.status(400).json({ error: "One or more imported menu items are invalid" });

  const operations = input.map(item => {
    const name = item.name.trim();
    const category = item.category.trim();
    return {
      updateOne: {
        filter: { restaurantId: restaurant._id, name, category, pricePaise: item.pricePaise },
        update: { $setOnInsert: {
          restaurantId: restaurant._id, name, category, foodType: item.foodType,
          pricePaise: item.pricePaise, description: String(item.description || "").trim(),
          imageUrl: "", available: true
        } },
        upsert: true
      }
    };
  });
  const result = await MenuItem.bulkWrite(operations, { ordered: false });
  const added = result.upsertedCount || 0;
  return res.status(200).json({
    imported: added,
    alreadyPresent: input.length - added,
    totalSubmitted: input.length
  });
}

async function updateMenuItem(req, res) {
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const allowed = ["name", "description", "imageUrl", "pricePaise", "category", "foodType", "available"];
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
  if (input.foodType !== undefined && !["veg", "nonVeg"].includes(input.foodType)) {
    return res.status(400).json({ error: "Food type must be Veg or Non-Veg" });
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
  const restaurant = await getOwnedRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const item = await MenuItem.findOneAndDelete({
    _id: req.params.id,
    restaurantId: restaurant._id
  });

  if (!item) return res.status(404).json({ error: "Menu item not found" });
  return res.status(204).end();
}

module.exports = { getOwnSubscription,
  listRestaurants, getRestaurant, getPublicMenu,
  getOwnMenu, getOwnInventory, updateOwnInventoryItem, listOwnGroceryStock, createOwnGroceryStock, updateOwnGroceryStock, deleteOwnGroceryStock, createMenuItem, importOwnMenu, updateMenuItem, deleteMenuItem, setOwnOpenStatus, updateOwnServiceSettings,
  listOwnStaff, createOwnStaff, removeOwnStaff, listOwnDeliveryPartners, createOwnDeliveryPartner, updateOwnDeliveryPartner, setOwnDeliveryPartnerProfileStatus, getOwnReports, updateOwnProfile, deactivateOwnProfile
};
