const Order = require("../models/Order");
const User = require("../models/User");

async function restoreOrderRewardStamps(order) {
  const stamps = Number(order.loyaltyStampsUsed) || 0;
  if (!order.customerId || stamps < 1) return;
  const restored = await Order.updateOne(
    { _id: order._id, status: "cancelled", loyaltyStampsUsed: { $gt: 0 }, loyaltyStampsRestoredAt: null },
    { $set: { loyaltyStampsRestoredAt: new Date() } }
  );
  if (restored.modifiedCount !== 1) return;
  const result = await User.updateOne(
    { _id: order.customerId, loyaltyStampsRedeemed: { $gte: stamps } },
    { $inc: { loyaltyStampsRedeemed: -stamps } }
  );
  if (result.modifiedCount !== 1) console.error("[loyalty] unable to restore redeemed stamps", { orderId: String(order._id), stamps });
}

module.exports = { restoreOrderRewardStamps };
