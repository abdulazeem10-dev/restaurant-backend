const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  { _id: false }
);

const dailyHoursSchema = new mongoose.Schema({
  closed: { type: Boolean, required: true, default: false },
  opensAt: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: "09:00" },
  closesAt: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: "22:00" }
}, { _id: false });

const openingHoursSchema = new mongoose.Schema({
  monday: { type: dailyHoursSchema, required: true },
  tuesday: { type: dailyHoursSchema, required: true },
  wednesday: { type: dailyHoursSchema, required: true },
  thursday: { type: dailyHoursSchema, required: true },
  friday: { type: dailyHoursSchema, required: true },
  saturday: { type: dailyHoursSchema, required: true },
  sunday: { type: dailyHoursSchema, required: true }
}, { _id: false });

const restaurantSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    description: {
      type: String,
      maxlength: 2000,
      default: ""
    },
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: ""
    },
    foodType: {
      type: String,
      enum: ["veg", "nonVeg", "both"],
      default: "both"
    },
    cuisine: {
      type: String,
      enum: ["north-indian", "pizza", "chinese", "desserts", "burger", "biryani", "south-indian", "noodles", "rolls", "shawarma", "vada", "dosa", "momo", "salads", "other"],
      default: "other",
      index: true
    },
    openingHours: {
      type: openingHoursSchema,
      default: undefined
    },
    deliveryPincodes: {
      type: [{ type: String, match: /^\d{6}$/ }],
      default: []
    },
    deliveryAreas: {
      type: [{
        name: { type: String, required: true, trim: true, maxlength: 80 },
        pincodes: { type: [{ type: String, match: /^\d{6}$/ }], default: [] }
      }],
      default: []
    },
    prepTimeMinutes: { type: Number, min: 5, max: 180, default: 30 },
    deliveryTimeMinutes: { type: Number, min: 5, max: 180, default: 30 },
    location: {
      type: locationSchema,
      default: undefined
    },
    isOpen: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending"
    },
    profileDeactivatedAt: { type: Date, default: null },
    statusBeforeProfileDeactivation: { type: String, enum: ["pending", "approved", "rejected", "suspended"], default: null }
  },
  { timestamps: true }
);

restaurantSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Restaurant", restaurantSchema);
