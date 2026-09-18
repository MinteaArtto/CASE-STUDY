require("dotenv").config();

const mongoose = require("mongoose");

async function cleanupAdminUser() {
  try {
    // ========================================================
    // CHECK DATABASE CONNECTION
    // ========================================================

    if (!process.env.ATLAS_URI) {
      throw new Error("ATLAS_URI is missing from .env");
    }

    // ========================================================
    // CONNECT TO MONGODB
    // ========================================================

    await mongoose.connect(process.env.ATLAS_URI);

    console.log("Connected to MongoDB Atlas.");

    // ========================================================
    // ACCESS RAW USERS COLLECTION
    //
    // We use the raw collection so MongoDB can remove fields
    // that are no longer part of the Mongoose User schema.
    // ========================================================

    const usersCollection = mongoose.connection.collection("users");

    // ========================================================
    // CLEAN ADMIN ACCOUNT
    // ========================================================

    const result = await usersCollection.updateOne(
      {
        email: "admin@system.com",
      },

      {
        $set: {
          username: "Administrator",

          role: "admin",
        },

        $unset: {
          firstName: "",
          lastName: "",
        },
      },
    );

    // ========================================================
    // RESULT
    // ========================================================

    console.log("Matched documents:", result.matchedCount);

    console.log("Modified documents:", result.modifiedCount);

    // ========================================================
    // VERIFY DOCUMENT
    // ========================================================

    const admin = await usersCollection.findOne({
      email: "admin@system.com",
    });

    if (!admin) {
      console.log("Admin account not found.");

      return;
    }

    console.log("Admin account after cleanup:");

    console.log({
      _id: admin._id,

      username: admin.username,

      email: admin.email,

      role: admin.role,

      firstName: admin.firstName,

      lastName: admin.lastName,
    });
  } catch (error) {
    console.error("Cleanup failed:", error.message);
  } finally {
    await mongoose.disconnect();

    console.log("MongoDB connection closed.");
  }
}

cleanupAdminUser();
