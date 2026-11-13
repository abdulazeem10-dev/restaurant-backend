const capabilities = {
  // Secondary admins can run the restaurant workspace, including staff accounts.
  secondary_admin: new Set(["read", "menu", "inventory_read", "inventory", "orders", "settings", "accounts"]),
  // Billers can operate every workspace feature except managing logins.
  biller_modifier: new Set(["read", "menu", "inventory_read", "inventory", "orders", "settings"]),
  // Viewers can inspect all workspace data, including grocery inventory, but cannot mutate it.
  viewer: new Set(["read", "inventory_read"])
};

function authorizeRestaurant(permission = "read") {
  return (req, res, next) => {
    const user = req.user;
    if (user?.role === "restaurant") return next();
    if (user?.role === "restaurant_staff" && capabilities[user.restaurantStaffRole]?.has(permission)) return next();
    return res.status(403).json({ error: "Access denied" });
  };
}

module.exports = authorizeRestaurant;
