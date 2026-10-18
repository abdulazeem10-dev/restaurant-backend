const express = require("express");
const controller = require("../controllers/customerController");
const authenticate = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();
router.use(authenticate, authorize("customer"));
router.get("/addresses", asyncHandler(controller.listAddresses));
router.post("/addresses", asyncHandler(controller.addAddress));
router.delete("/addresses/:id", asyncHandler(controller.deleteAddress));
module.exports = router;
