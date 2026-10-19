const express = require("express");
const controller = require("../controllers/notificationController");
const authenticate = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate);
router.get("/mine", asyncHandler(controller.listMine));
router.patch("/mine/:id/read", asyncHandler(controller.markRead));

module.exports = router;
