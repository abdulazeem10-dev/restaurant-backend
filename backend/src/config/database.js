const mongoose = require("mongoose");

// Reuse one connection across requests in Vercel's warm serverless instances.
const cache = globalThis.__foodPlatformMongo || (globalThis.__foodPlatformMongo = { promise: null });

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;

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

  return cache.promise;
}

module.exports = connectDatabase;
