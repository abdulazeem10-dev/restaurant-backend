require("dotenv").config();
const app = require("./app");
const connectDatabase = require("./config/database");

if (require.main === module) {
  async function start() {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error("Set JWT_SECRET to a generated secret of at least 32 characters");
    }
    await connectDatabase();
    const port = Number(process.env.PORT) || 5000;
    const server = app.listen(port, () => console.log(`API listening on port ${port}`));
    // Bound slow/incomplete HTTP requests for the standalone Node server.
    // Serverless hosts enforce their own platform-level request timeouts.
    server.headersTimeout = 10_000;
    server.requestTimeout = 30_000;
    server.keepAliveTimeout = 5_000;
    server.maxRequestsPerSocket = 100;
  }

  start().catch(error => {
    console.error("Startup failed:", error.message);
    process.exit(1);
  });
}

// Vercel imports the Express app as a serverless handler. Local `npm run dev`
// still starts the port listener above.
module.exports = app;
