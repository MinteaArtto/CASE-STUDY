const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
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

// Test route - just to check server is running
app.get("/", (req, res) => {
  res.json({
    message: "Server is running!",
    status: "Online",
    mongodb:
      mongoose.connection.readyState === 1 ? "Connected" : "Not connected",
  });
});

// MongoDB Connection Test
app.get("/api/test-connection", async (req, res) => {
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

// Connect to MongoDB
mongoose
  .connect(process.env.ATLAS_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB Connected!");
    console.log("Database: " + mongoose.connection.db.databaseName);
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err.message);
  });

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Test connection: http://localhost:${port}/api/test-connection`);
});
