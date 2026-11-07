const { z } = require("zod");
const AggregatorSale = require("../models/AggregatorSale");
const Restaurant = require("../models/Restaurant");

const rowSchema = z.object({
  orderId: z.string().trim().min(1).max(120),
  date: z.string().trim().min(8).max(40),
  status: z.string().trim().min(1).max(40),
  gross: z.number().finite().min(0).max(10_000_000),
  commission: z.number().finite().min(0).max(10_000_000),
  payout: z.number().finite().min(0).max(10_000_000)
}).strict();

async function getRestaurant(user) {
  if (user.role === "restaurant_staff") return Restaurant.findById(user.restaurantId).select("_id");
  return Restaurant.findOne({ ownerId: user._id }).select("_id");
}

function dateRange(query) {
  const valid = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (!valid(query.from) || !valid(query.to)) return null;
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const to = new Date(`${query.to}T00:00:00.000Z`);
  if (to < from || (to - from) / 86400000 > 365) return null;
  return { $gte: from, $lt: new Date(to.getTime() + 86400000) };
}

async function importReport(req, res) {
  const platform = req.body?.platform;
  const rows = req.body?.rows;
  if (!["zomato", "swiggy"].includes(platform) || !Array.isArray(rows) || !rows.length || rows.length > 500) {
    return res.status(400).json({ error: "Choose a platform and upload 1–500 valid report rows." });
  }
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const normalized = [];
  for (let index = 0; index < rows.length; index += 1) {
    const parsed = rowSchema.safeParse(rows[index]);
    const orderDate = parsed.success ? new Date(parsed.data.date) : null;
    if (!parsed.success || !orderDate || Number.isNaN(orderDate.getTime())) {
      return res.status(400).json({ error: `Invalid CSV data at row ${index + 2}. Use the provided template.` });
    }
    const row = parsed.data;
    normalized.push({
      updateOne: {
        filter: { restaurantId: restaurant._id, platform, externalOrderId: row.orderId },
        update: { $set: {
          orderDate, status: row.status.toLowerCase(),
          grossPaise: Math.round(row.gross * 100), commissionPaise: Math.round(row.commission * 100),
          payoutPaise: Math.round(row.payout * 100), importedBy: req.user._id
        }, $setOnInsert: { restaurantId: restaurant._id, platform, externalOrderId: row.orderId } },
        upsert: true
      }
    });
  }
  const result = await AggregatorSale.bulkWrite(normalized, { ordered: true });
  return res.status(200).json({
    imported: result.upsertedCount + result.modifiedCount,
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
    platform
  });
}

async function getReport(req, res) {
  const orderDate = dateRange(req.query);
  if (!orderDate) return res.status(400).json({ error: "Choose a valid date range of up to 366 days." });
  const restaurant = await getRestaurant(req.user);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const [platforms, recentImports] = await Promise.all([
    AggregatorSale.aggregate([
      { $match: { restaurantId: restaurant._id, orderDate } },
      { $group: { _id: "$platform", orders: { $sum: 1 }, grossPaise: { $sum: "$grossPaise" }, commissionPaise: { $sum: "$commissionPaise" }, payoutPaise: { $sum: "$payoutPaise" } } },
      { $sort: { _id: 1 } }
    ]),
    AggregatorSale.aggregate([
      { $match: { restaurantId: restaurant._id, orderDate } },
      { $group: { _id: { platform: "$platform", date: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate", timezone: "UTC" } } }, orders: { $sum: 1 }, grossPaise: { $sum: "$grossPaise" }, commissionPaise: { $sum: "$commissionPaise" }, payoutPaise: { $sum: "$payoutPaise" } } },
      { $sort: { "_id.date": -1, "_id.platform": 1 } }, { $limit: 100 }
    ])
  ]);
  return res.json({ platforms, recentImports });
}

module.exports = { importReport, getReport };
