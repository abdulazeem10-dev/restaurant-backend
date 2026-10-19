const capabilities = {
  secondary_admin: new Set(["read", "menu", "orders", "settings"]),
  biller_modifier: new Set(["read", "menu", "orders"]),
  viewer: new Set(["read"])
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
