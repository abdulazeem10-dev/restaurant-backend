const mongoose = require("mongoose");
const Order = require("../models/Order");
const SubscriptionPayment = require("../models/SubscriptionPayment");

// Reuse one connection across requests in Vercel's warm serverless instances.
const cache = globalThis.__foodPlatformMongo || (globalThis.__foodPlatformMongo = { promise: null, indexPromise: null });

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(process.env.MONGODB_URI, {
      // Bound resource usage per app instance and fail quickly during an
      // unavailable database instead of holding API requests indefinitely.
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    })
      .then(() => {
        console.log("MongoDB connected");
        return mongoose.connection;
      })
      .catch(error => {
        cache.promise = null;
        throw error;
      });
  }

  await cache.promise;
  // A Mongo unique index is necessary to arbitrate simultaneous order retries.
  // Build it explicitly because production deployments may disable autoIndex.
  if (!cache.indexPromise) {
    cache.indexPromise = Promise.all([Order.createIndexes(), SubscriptionPayment.createIndexes()]).catch(error => {
      cache.indexPromise = null;
      throw error;
    });
  }
  await cache.indexPromise;
  return mongoose.connection;
}

module.exports = connectDatabase;
