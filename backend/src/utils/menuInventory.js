const MenuItem = require("../models/MenuItem");

function stockError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

async function changeStock(restaurantId, itemId, quantityDelta) {
  await MenuItem.updateOne(
    { _id: itemId, restaurantId, stockTracked: true },
    { $inc: { stockQuantity: quantityDelta } }
  );
}

async function restoreReservedStock(restaurantId, reservations) {
  await Promise.all(reservations.map(item => changeStock(restaurantId, item.menuItemId, item.quantity)));
}

async function reserveMenuStock(restaurantId, lines) {
  const quantities = new Map();
  for (const line of lines) quantities.set(String(line.menuItemId), (quantities.get(String(line.menuItemId)) || 0) + line.quantity);
  const ids = [...quantities.keys()];
  const items = await MenuItem.find({ _id: { $in: ids }, restaurantId }).select("_id name stockTracked stockQuantity").lean();
  const itemById = new Map(items.map(item => [String(item._id), item]));
  const reservations = [];

  try {
    for (const [menuItemId, quantity] of quantities) {
      const item = itemById.get(menuItemId);
      if (!item) throw stockError("A selected dish is no longer on this restaurant menu. Refresh and try again.");
      if (!item.stockTracked) continue;
      const updated = await MenuItem.findOneAndUpdate(
        { _id: item._id, restaurantId, stockTracked: true, stockQuantity: { $gte: quantity } },
        { $inc: { stockQuantity: -quantity } },
        { new: true }
      ).select("_id").lean();
      if (!updated) throw stockError(`Not enough stock for ${item.name}. Refresh the menu or update inventory.`);
      reservations.push({ menuItemId: item._id, quantity });
    }
    return reservations;
  } catch (error) {
    await restoreReservedStock(restaurantId, reservations);
    throw error;
  }
}

module.exports = { reserveMenuStock, restoreReservedStock };
