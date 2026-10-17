const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, select: false },
  phone: { type: String, trim: true, maxlength: 20, default: "" },
  googleSub: { type: String, select: false, sparse: true, unique: true },
  role: {
    type: String,
    enum: ["customer", "restaurant", "delivery", "admin"],
    required: true,
    default: "customer"
  },
  status: {
    type: String,
    enum: ["active", "pending", "suspended"],
    default: "active"
  },
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
