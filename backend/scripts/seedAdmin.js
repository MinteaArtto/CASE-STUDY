require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");

// ============================================================
// VALIDATION RULES
// ============================================================

const usernameRegex = /^[A-Za-z0-9_.]{2,30}$/;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

// ============================================================
// SEED / UPDATE ADMIN
// ============================================================

async function seedAdmin() {
  try {
    const { ATLAS_URI, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } =
      process.env;

    // ========================================================
    // CHECK ENV VARIABLES
    // ========================================================

    if (!ATLAS_URI) {
      throw new Error("ATLAS_URI is missing from .env");
    }

    if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD are required.",
      );
    }

    // ========================================================
    // NORMALIZE VALUES
    // ========================================================

    const username = ADMIN_USERNAME.trim();

    const email = ADMIN_EMAIL.trim().toLowerCase();

    const password = String(ADMIN_PASSWORD);

    // ========================================================
    // USERNAME VALIDATION
    // ========================================================

    if (!usernameRegex.test(username)) {
      throw new Error(
        "Admin username must be 2-30 characters and may only contain letters, numbers, underscores, and periods.",
      );
    }

    // ========================================================
    // EMAIL VALIDATION
    // ========================================================

    if (!emailRegex.test(email)) {
      throw new Error("ADMIN_EMAIL is not a valid email address.");
    }

    // ========================================================
    // PASSWORD VALIDATION
    // ========================================================

    if (!passwordRegex.test(password)) {
      throw new Error(
        "Admin password must be 8-20 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
      );
    }

    // ========================================================
    // CONNECT TO MONGODB
    // ========================================================

    await mongoose.connect(ATLAS_URI);

    console.log("Connected to MongoDB Atlas.");

    // ========================================================
    // CHECK IF USERNAME BELONGS TO ANOTHER ACCOUNT
    // ========================================================

    const usernameOwner = await User.findOne({
      username,
      email: {
        $ne: email,
      },
    });

    if (usernameOwner) {
      throw new Error(
        "ADMIN_USERNAME is already being used by another account.",
      );
    }

    // ========================================================
    // HASH PASSWORD
    // ========================================================

    const passwordHash = await bcrypt.hash(password, 12);

    // ========================================================
    // CREATE OR UPDATE ADMIN
    // ========================================================

    const admin = await User.findOneAndUpdate(
      {
        email,
      },

      {
        $set: {
          username,
          email,
          password: passwordHash,
          role: "admin",
        },
      },

      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("Admin account ready.");

    console.log("Username:", admin.username);

    console.log("Email:", admin.email);

    console.log("Role:", admin.role);
  } catch (error) {
    console.error("Admin seed failed:", error.message);

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();

    console.log("MongoDB connection closed.");
  }
}

seedAdmin();
