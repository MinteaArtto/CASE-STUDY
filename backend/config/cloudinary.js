const path = require("path");
const dotenv = require("dotenv");
const { v2: cloudinary } = require("cloudinary");

// ============================================================
// LOAD BACKEND .ENV
// ============================================================

dotenv.config({
  path: path.join(__dirname, "..", ".env"),
});

// ============================================================
// CHECK CLOUDINARY VARIABLES
// ============================================================

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  throw new Error(
    "Cloudinary environment variables are missing. Check backend/.env.",
  );
}

// ============================================================
// CLOUDINARY CONFIGURATION
// ============================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,

  api_key: process.env.CLOUDINARY_API_KEY,

  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
