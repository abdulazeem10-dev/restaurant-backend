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
    app.listen(port, () => console.log(`API listening on port ${port}`));
  }

  start().catch(error => {
    console.error("Startup failed:", error.message);
    process.exit(1);
  });
}

// Vercel imports the Express app as a serverless handler. Local `npm run dev`
// still starts the port listener above.
module.exports = app;
