const { createHash } = require("node:crypto");
const Restaurant = require("../models/Restaurant");

const MENU_IMAGE_FORMATS = "jpg,jpeg,png,webp";

async function createMenuImageUploadSignature(req, res) {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(503).json({ error: "Cloudinary uploads are not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to the Render backend environment." });
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cloudName) || !/^[a-zA-Z0-9_-]{1,128}$/.test(apiKey)) {
    return res.status(503).json({ error: "Cloudinary configuration is invalid. Check the Cloudinary cloud name and API key in Render." });
  }

  const restaurant = req.user?.role === "restaurant_staff"
    ? await Restaurant.findById(req.user.restaurantId).select("_id status")
    : await Restaurant.findOne({ ownerId: req.user?._id }).select("_id status");
  if (!restaurant || restaurant.status !== "approved") {
    return res.status(403).json({ error: "An approved restaurant account is required to upload menu photos." });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `foodway/restaurants/${restaurant._id}/menu`;
  const signedParams = {
    allowed_formats: MENU_IMAGE_FORMATS,
    folder,
    timestamp
  };
  const parameterString = Object.keys(signedParams).sort()
    .map(key => `${key}=${signedParams[key]}`).join("&");
  const signature = createHash("sha1")
    .update(`${parameterString}${apiSecret}`, "utf8")
    .digest("hex");

  return res.json({ cloudName, apiKey, timestamp, folder, allowedFormats: MENU_IMAGE_FORMATS, signature });
}

module.exports = { createMenuImageUploadSignature };
