const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, select: false },
  phone: { type: String, trim: true, maxlength: 20, default: "" },
  googleSub: { type: String, select: false, sparse: true, unique: true },
  role: {
    type: String,
    enum: ["customer", "restaurant", "restaurant_staff", "delivery", "admin"],
    required: true,
    default: "customer"
  },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", default: null },
  restaurantStaffRole: {
    type: String,
    enum: ["secondary_admin", "biller_modifier", "viewer", null],
    default: null
  },
  status: {
    type: String,
    enum: ["active", "pending", "suspended"],
    default: "active"
  },
  savedAddresses: [{
    label: { type: String, trim: true, maxlength: 40, default: "Home" },
    recipientType: { type: String, enum: ["self", "other"], required: true, default: "self" },
    name: { type: String, trim: true, required: true, maxlength: 100 },
    phone: { type: String, required: true, match: /^\d{10}$/ },
    flatBuilding: { type: String, trim: true, required: true, maxlength: 120 },
    lane: { type: String, trim: true, required: true, maxlength: 180 },
    landmark: { type: String, trim: true, maxlength: 120, default: "" },
    pincode: { type: String, required: true, match: /^\d{6}$/ }
  }],
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false }
}, { timestamps: true });

userSchema.index(
  { restaurantId: 1, restaurantStaffRole: 1 },
  { unique: true, partialFilterExpression: { role: "restaurant_staff" } }
);

module.exports = mongoose.model("User", userSchema);
