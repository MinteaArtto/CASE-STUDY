const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const spoilageRoutes = require("./routes/spoilageRoutes");
const priceRoutes = require("./routes/priceRoutes");

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/spoilage", spoilageRoutes);
app.use("/api/prices", priceRoutes);

const healthResponse = (req, res) => {
  res.json({
    message: "Server is running!",
    status: "Online",
    mongodb:
      mongoose.connection.readyState === 1
        ? "Connected"
        : process.env.ATLAS_URI || process.env.MONGODB_URI
          ? "Not connected"
          : "Not configured",
  });
};
app.get("/api/health", healthResponse);

const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.get("/", healthResponse);
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  return res.sendFile(path.join(frontendDist, "index.html"));
});

// MongoDB Connection Test
app.get("/api/test-connection", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: process.env.ATLAS_URI || process.env.MONGODB_URI
        ? "MongoDB is not connected."
        : "MongoDB is not configured. Set ATLAS_URI to enable this check.",
    });
  }

  try {
    // Try to ping the database
    await mongoose.connection.db.command({ ping: 1 });
    res.json({
      success: true,
      message: "MongoDB is connected!",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "MongoDB connection failed",
      error: error.message,
    });
  }
});

function startServer() {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Test connection: /api/test-connection`);
  });

  const mongoUri = process.env.ATLAS_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn(
      "MongoDB URI is not configured; continuing without MongoDB.",
    );
    return;
  }

  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log("MongoDB Connected!");
      console.log("Database: " + mongoose.connection.db.databaseName);
    })
    .catch((error) => {
      console.error("MongoDB Connection Error:", error.message);
    });
}

startServer();
