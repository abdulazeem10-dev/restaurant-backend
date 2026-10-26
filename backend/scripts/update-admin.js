require("dotenv").config();
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function main() {
  const { MONGODB_URI, ADMIN_CURRENT_EMAIL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!MONGODB_URI || !ADMIN_CURRENT_EMAIL || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
    throw new Error("Set MONGODB_URI, ADMIN_CURRENT_EMAIL, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 16 characters");
  }

  await mongoose.connect(MONGODB_URI);
  const currentEmail = ADMIN_CURRENT_EMAIL.trim().toLowerCase();
  const newEmail = ADMIN_EMAIL.trim().toLowerCase();
  const admin = await User.findOne({ email: currentEmail, role: "admin" });
  if (!admin) throw new Error("No platform admin account was found for ADMIN_CURRENT_EMAIL");

  const emailInUse = await User.findOne({ email: newEmail, _id: { $ne: admin._id } }).select("_id").lean();
  if (emailInUse) throw new Error("ADMIN_EMAIL is already used by another account");

  admin.email = newEmail;
  admin.passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  if (ADMIN_NAME?.trim()) admin.name = ADMIN_NAME.trim();
  await admin.save();
  console.log("Platform admin credentials updated.");
}

main()
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
