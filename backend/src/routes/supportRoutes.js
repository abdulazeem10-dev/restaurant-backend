const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const controller = require("../controllers/supportController");

const router = express.Router();
router.post("/chat", asyncHandler(controller.chat));

module.exports = router;
