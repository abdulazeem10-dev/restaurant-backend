require("dotenv").config();

const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Restaurant = require("../src/models/Restaurant");
const MenuItem = require("../src/models/MenuItem");

const restaurants = [
  {
    owner: { name: "Sunrise Demo Owner", email: "sunrise.owner@foodway-demo.test", phone: "9000000001" },
    restaurant: {
      name: "Sunrise Tiffin House",
      description: "Freshly prepared South Indian breakfast and comforting tiffin favourites.",
      address: "Sector 19, Ulwe, Navi Mumbai",
      cuisine: "south-indian",
      foodType: "veg",
      prepTimeMinutes: 20,
      deliveryTimeMinutes: 30
    },
    dishes: [
      { name: "Masala Dosa", description: "Crisp dosa with spiced potato, sambar and chutneys.", imageUrl: "../assets/images/cuisines/dosa.webp", pricePaise: 11000, category: "Breakfast", foodType: "veg" },
      { name: "Idli Sambar", description: "Steamed rice cakes served with sambar and coconut chutney.", imageUrl: "../assets/images/cuisines/south-indian.webp", pricePaise: 8000, category: "Breakfast", foodType: "veg" },
      { name: "Medu Vada", description: "Golden lentil fritters with sambar and chutney.", imageUrl: "../assets/images/cuisines/vada.jpg", pricePaise: 7000, category: "Breakfast", foodType: "veg" }
    ]
  },
  {
    owner: { name: "Spice Route Demo Owner", email: "spiceroute.owner@foodway-demo.test", phone: "9000000002" },
    restaurant: {
      name: "Spice Route Kitchen",
      description: "North Indian comfort food, slow-cooked curries and fresh breads.",
      address: "Sector 17, Ulwe, Navi Mumbai",
      cuisine: "north-indian",
      foodType: "both",
      prepTimeMinutes: 30,
      deliveryTimeMinutes: 35
    },
    dishes: [
      { name: "Paneer Butter Masala", description: "Paneer in a creamy tomato and butter gravy.", imageUrl: "../assets/images/cuisines/north-indian.webp", pricePaise: 24000, category: "Main course", foodType: "veg" },
      { name: "Chicken Kolhapuri", description: "Chicken simmered in a bold, aromatic spiced gravy.", imageUrl: "../assets/images/cuisines/biryani.webp", pricePaise: 28000, category: "Main course", foodType: "nonVeg" },
      { name: "Jeera Rice", description: "Fluffy basmati rice tempered with cumin.", imageUrl: "../assets/images/cuisines/all.webp", pricePaise: 12000, category: "Rice & biryani", foodType: "veg" }
    ]
  },
  {
    owner: { name: "Wok and Bowl Demo Owner", email: "wokandbowl.owner@foodway-demo.test", phone: "9000000003" },
    restaurant: {
      name: "Wok & Bowl",
      description: "Quick Chinese-style noodles, rice bowls and wok-tossed favourites.",
      address: "Sector 5, Ulwe, Navi Mumbai",
      cuisine: "chinese",
      foodType: "both",
      prepTimeMinutes: 25,
      deliveryTimeMinutes: 35
    },
    dishes: [
      { name: "Veg Hakka Noodles", description: "Wok-tossed noodles with vegetables and savoury sauce.", imageUrl: "../assets/images/cuisines/noodles.webp", pricePaise: 16000, category: "Noodles", foodType: "veg" },
      { name: "Paneer Fried Rice", description: "Fried rice with paneer, vegetables and spring onion.", imageUrl: "../assets/images/cuisines/other.webp", pricePaise: 18000, category: "Rice", foodType: "veg" },
      { name: "Chicken Manchurian", description: "Crispy chicken in a tangy Indo-Chinese sauce.", imageUrl: "../assets/images/cuisines/chinese.webp", pricePaise: 22000, category: "Starters", foodType: "nonVeg" }
    ]
  }
];

function assertSafeTarget() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
  if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Set ALLOW_DEMO_SEED=true only for a disposable demo database.");
  if (!process.argv.includes("--apply")) throw new Error("No changes made. Re-run with --apply to seed the demo data.");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");

  const databaseName = new URL(process.env.MONGODB_URI).pathname.replace(/^\//, "");
  const isDemoDatabase = /(?:^|[_-])(demo|dev|test)$/i.test(databaseName);
  const explicitlyAllowsExistingDatabase = process.argv.includes("--allow-existing-database");
  if (!isDemoDatabase && !explicitlyAllowsExistingDatabase) {
    throw new Error(`Refusing to seed database '${databaseName || "(default)"}'. Use a database ending in _demo, _dev or _test, or explicitly pass --allow-existing-database.`);
  }
  if (!isDemoDatabase) console.warn(`Explicit override enabled: approved demo restaurants will be added to '${databaseName || "(default)"}' and may appear on the customer site.`);
}

async function upsertRestaurantBundle(bundle) {
  let owner = await User.findOne({ email: bundle.owner.email });
  if (!owner) {
    const oneTimePassword = crypto.randomBytes(24).toString("base64url");
    owner = await User.create({
      ...bundle.owner,
      passwordHash: await bcrypt.hash(oneTimePassword, 12),
      role: "restaurant",
      status: "active"
    });
    console.log(`Created demo owner ${owner.email}; one-time password (store securely): ${oneTimePassword}`);
  } else {
    owner.name = bundle.owner.name;
    owner.phone = bundle.owner.phone;
    owner.role = "restaurant";
    owner.status = "active";
    await owner.save();
  }

  const restaurant = await Restaurant.findOneAndUpdate(
    { ownerId: owner._id },
    { $set: { ...bundle.restaurant, ownerId: owner._id, status: "approved", isOpen: true } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  for (const dish of bundle.dishes) {
    await MenuItem.findOneAndUpdate(
      { restaurantId: restaurant._id, name: dish.name },
      { $set: { ...dish, restaurantId: restaurant._id, available: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`${restaurant.name}: upserted ${bundle.dishes.length} dishes.`);
}

async function main() {
  assertSafeTarget();
  await mongoose.connect(process.env.MONGODB_URI);
  for (const bundle of restaurants) await upsertRestaurantBundle(bundle);
  console.log("Demo restaurant data is ready.");
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
