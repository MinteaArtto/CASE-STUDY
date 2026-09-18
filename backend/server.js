const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

const spoilageRoutes = require("./routes/spoilageRoutes");
const priceRoutes = require("./routes/priceRoutes");
const authRoutes = require("./routes/authRoutes");
const adminPriceRoutes = require("./routes/adminPriceRoutes");

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(
  express.urlencoded({
    extended: true,
  }),
);

// ============================================================
// DEBUG MIDDLEWARE
//
// Temporary:
// This lets us confirm that requests sent to the admin price
// routes are actually arriving with a JSON body.
//
// You can remove this later after testing is finished.
// ============================================================

app.use("/api/admin/prices", (req, res, next) => {
  console.log("\n==============================");
  console.log("ADMIN PRICE REQUEST");
  console.log("==============================");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("Body:");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("==============================\n");

  next();
});

// ============================================================
// ROUTES
// ============================================================

app.use("/api/auth", authRoutes);

app.use("/api/spoilage", spoilageRoutes);

app.use("/api/prices", priceRoutes);

app.use("/api/admin/prices", adminPriceRoutes);

// ============================================================
// TEST ROUTE
// ============================================================

app.get("/", (req, res) => {
  res.json({
    message: "Server is running!",
    status: "Online",
    mongodb:
      mongoose.connection.readyState === 1 ? "Connected" : "Not connected",
  });
});

// ============================================================
// MONGODB CONNECTION TEST
// ============================================================

app.get("/api/test-connection", async (req, res) => {
  try {
    await mongoose.connection.db.command({
      ping: 1,
    });

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

// ============================================================
// CONNECT TO MONGODB
// ============================================================

mongoose
  .connect(process.env.ATLAS_URI)
  .then(() => {
    console.log("MongoDB Connected!");

    if (mongoose.connection.db) {
      console.log("Database:", mongoose.connection.db.databaseName);
    }
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err.message);
  });

// ============================================================
// START SERVER
// ============================================================

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);

  console.log(`Test connection: http://localhost:${port}/api/test-connection`);
});
