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
    }
  },
  { timestamps: true }
);

restaurantSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Restaurant", restaurantSchema);
