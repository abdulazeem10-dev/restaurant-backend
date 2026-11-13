const express = require("express");
const controller = require("../controllers/notificationController");
const authenticate = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate);
router.get("/mine", asyncHandler(controller.listMine));
router.patch("/mine/:id/read", (req, res, next) => {
  if (req.user?.role === "restaurant_staff" && req.user.restaurantStaffRole === "viewer") {
    return res.status(403).json({ error: "Viewer accounts are read-only" });
  }
  return next();
}, asyncHandler(controller.markRead));

module.exports = router;
