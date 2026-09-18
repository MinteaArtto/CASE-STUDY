const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");

const { analyzeSpoilageImage } = require("../services/spoilageMlService");

const requireAuth = require("../middleware/authMiddleware");

const SpoilageRecord = require("../models/SpoilageRecord");

const cloudinary = require("../config/cloudinary");

const router = express.Router();

// ============================================================
// UPLOAD FOLDER
// ============================================================

const uploadDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

// ============================================================
// IMAGE UPLOAD SECURITY
// ============================================================

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

// ============================================================
// EXTENSION FROM MIME
// ============================================================

function extensionForMimeType(mimeType) {
  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  return ".jpg";
}

// ============================================================
// MULTER STORAGE
// ============================================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const extension = extensionForMimeType(file.mimetype);

    const uniqueName = `${Date.now()}-${crypto.randomUUID()}${extension}`;

    cb(null, uniqueName);
  },
});

// ============================================================
// MULTER CONFIGURATION
// ============================================================

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_IMAGE_SIZE,

    files: 1,
  },

  fileFilter: function (req, file, cb) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and WebP images are allowed."));
    }

    cb(null, true);
  },
});

// ============================================================
// MULTER HANDLER
// ============================================================

function handleImageUpload(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,

          message: "Image must not exceed 20 MB.",
        });
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          success: false,

          message: "Only one image may be uploaded at a time.",
        });
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          success: false,

          message: 'Unexpected upload field. Use the field name "image".',
        });
      }

      return res.status(400).json({
        success: false,

        message: error.message || "Image upload failed.",
      });
    }

    if (error) {
      return res.status(400).json({
        success: false,

        message: error.message || "Invalid image upload.",
      });
    }

    next();
  });
}

// ============================================================
// DELETE TEMP FILE
// ============================================================

function deleteTemporaryImage(imagePath) {
  if (!imagePath) {
    return;
  }

  fs.unlink(imagePath, (error) => {
    if (error) {
      if (error.code !== "ENOENT") {
        console.error("Could not delete temporary image:", error.message);
      }
    } else {
      console.log("Temporary image deleted.");
    }
  });
}

// ============================================================
// DETECT ACTUAL IMAGE TYPE
// ============================================================

function detectImageTypeFromSignature(filePath) {
  const fileDescriptor = fs.openSync(filePath, "r");

  try {
    const header = Buffer.alloc(12);

    const bytesRead = fs.readSync(fileDescriptor, header, 0, header.length, 0);

    if (bytesRead < 12) {
      return null;
    }

    const isJpeg =
      header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;

    if (isJpeg) {
      return "image/jpeg";
    }

    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const isPng = header.subarray(0, 8).equals(pngSignature);

    if (isPng) {
      return "image/png";
    }

    const isWebp =
      header.toString("ascii", 0, 4) === "RIFF" &&
      header.toString("ascii", 8, 12) === "WEBP";

    if (isWebp) {
      return "image/webp";
    }

    return null;
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

// ============================================================
// VALIDATE UPLOAD CONTENT
// ============================================================

function validateUploadedImage(req, res, next) {
  if (!req.file) {
    return next();
  }

  let detectedMimeType = null;

  try {
    detectedMimeType = detectImageTypeFromSignature(req.file.path);
  } catch (error) {
    console.error("Could not inspect uploaded image:", error.message);

    deleteTemporaryImage(req.file.path);

    return res.status(400).json({
      success: false,

      message: "The uploaded image could not be validated.",
    });
  }

  if (!detectedMimeType) {
    deleteTemporaryImage(req.file.path);

    return res.status(400).json({
      success: false,

      message: "The uploaded file is not a valid JPEG, PNG, or WebP image.",
    });
  }

  if (detectedMimeType !== req.file.mimetype) {
    console.log("Image MIME mismatch detected.");

    console.log("Browser reported:", req.file.mimetype);

    console.log("Actual image type:", detectedMimeType);
  }

  const correctExtension = extensionForMimeType(detectedMimeType);

  const currentExtension = path.extname(req.file.path);

  if (currentExtension.toLowerCase() !== correctExtension) {
    const directory = path.dirname(req.file.path);

    const filenameWithoutExtension = path.basename(
      req.file.path,
      currentExtension,
    );

    const correctedFilename = filenameWithoutExtension + correctExtension;

    const correctedPath = path.join(directory, correctedFilename);

    try {
      fs.renameSync(req.file.path, correctedPath);

      req.file.path = correctedPath;

      req.file.filename = correctedFilename;
    } catch (error) {
      deleteTemporaryImage(req.file.path);

      return res.status(500).json({
        success: false,

        message: "Could not prepare the uploaded image for analysis.",
      });
    }
  }

  req.file.mimetype = detectedMimeType;

  req.file.detectedMimeType = detectedMimeType;

  next();
}

// ============================================================
// HISTORY LIMIT
// ============================================================

async function enforceHistoryLimit(userId) {
  const MAX_RECORDS = 20;

  const records = await SpoilageRecord.find({
    user: userId,
  })
    .sort({
      createdAt: -1,
    })
    .select("_id imagePublicId createdAt");

  if (records.length <= MAX_RECORDS) {
    return;
  }

  const recordsToDelete = records.slice(MAX_RECORDS);

  for (const record of recordsToDelete) {
    try {
      if (record.imagePublicId) {
        await cloudinary.uploader.destroy(record.imagePublicId);
      }

      await SpoilageRecord.deleteOne({
        _id: record._id,
      });
    } catch (error) {
      console.error(
        "Could not delete old spoilage history:",
        record._id,
        error.message,
      );
    }
  }
}

// ============================================================
// SAVE HISTORY
// ============================================================

async function saveClassificationHistory({
  req,
  mlResult,
  prediction,
  treeProbability,
  spoilageType,
  spoilageConfidence,
  recommendation,
}) {
  let cloudinaryResult = null;

  try {
    cloudinaryResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "mamav/spoilage",
    });

    const historyRecord = await SpoilageRecord.create({
      user: req.user._id,

      originalFilename: req.file.originalname,

      imageUrl: cloudinaryResult.secure_url,

      imagePublicId: cloudinaryResult.public_id,

      status: "classified",

      prediction,

      treeProbability,

      classProbabilities: {
        fresh: mlResult.spoilage.probabilities?.Fresh ?? null,

        rotten: mlResult.spoilage.probabilities?.Rotten ?? null,
      },

      produceValidation: mlResult.produce_validation,

      novelty: mlResult.ood,

      spoilageType,

      spoilageConfidence,

      recommendation,

      message: mlResult.message || null,
    });

    await enforceHistoryLimit(req.user._id);

    return historyRecord;
  } catch (error) {
    if (cloudinaryResult?.public_id) {
      try {
        await cloudinary.uploader.destroy(cloudinaryResult.public_id);
      } catch (cleanupError) {
        console.error(
          "Could not clean Cloudinary image:",
          cleanupError.message,
        );
      }
    }

    throw error;
  }
}

// ============================================================
// NYCKEL TOKEN
// ============================================================

async function getNyckelAccessToken() {
  const response = await axios.post(
    "https://www.nyckel.com/connect/token",

    new URLSearchParams({
      grant_type: "client_credentials",

      client_id: process.env.NYCKEL_CLIENT_ID,

      client_secret: process.env.NYCKEL_CLIENT_SECRET,
    }),

    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  return response.data.access_token;
}

// ============================================================
// NYCKEL SPOILAGE INDICATOR
// ============================================================

async function predictSpoilageWithNyckel(imagePath) {
  const accessToken = await getNyckelAccessToken();

  const imageBuffer = fs.readFileSync(imagePath);

  const base64Image = imageBuffer.toString("base64");

  const extension = path.extname(imagePath).toLowerCase();

  let mimeType = "image/jpeg";

  if (extension === ".png") {
    mimeType = "image/png";
  } else if (extension === ".webp") {
    mimeType = "image/webp";
  }

  const dataUri = `data:${mimeType};base64,${base64Image}`;

  const response = await axios.post(
    `https://www.nyckel.com/v1/functions/${process.env.NYCKEL_FUNCTION_ID}/invoke`,

    {
      data: dataUri,
    },

    {
      headers: {
        Authorization: `Bearer ${accessToken}`,

        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}

// ============================================================
// RECOMMENDATIONS
// ============================================================

function getRecommendation(prediction, spoilageType) {
  if (prediction?.toLowerCase() === "fresh") {
    return (
      "The product is classified as fresh. " +
      "Maintain proper handling and continue regular inspection " +
      "to preserve its quality."
    );
  }

  if (prediction?.toLowerCase() !== "rotten") {
    return "Inspect the product before making an inventory decision.";
  }

  const type = spoilageType?.toLowerCase() || "";

  if (
    type.includes("dryness") ||
    type.includes("shrinkage") ||
    type.includes("wrinkling")
  ) {
    return (
      "Inspect the affected product and prioritize it for inventory review " +
      "due to visible signs of moisture loss and deterioration."
    );
  }

  if (type.includes("discoloration") || type.includes("color change")) {
    return (
      "Inspect and separate the affected product from normal inventory " +
      "and check nearby products for similar visible changes."
    );
  }

  if (
    type.includes("softness") ||
    type.includes("textural change") ||
    type.includes("pitting")
  ) {
    return (
      "Inspect the severity of the deterioration and prioritize " +
      "the affected product for immediate handling."
    );
  }

  if (
    type.includes("mold") ||
    type.includes("visible rot") ||
    type.includes("slime") ||
    type.includes("pus")
  ) {
    return (
      "Remove the affected product from sellable inventory " +
      "and inspect nearby products for similar signs of spoilage."
    );
  }

  if (type.includes("fermentation") || type.includes("liquefaction")) {
    return (
      "Separate the affected product from sellable inventory " +
      "and inspect it for further signs of advanced deterioration."
    );
  }

  if (type.includes("foul odor") || type === "smell") {
    return (
      "A possible odor-related spoilage indicator was returned. " +
      "Verify the product manually before making an inventory decision."
    );
  }

  if (type.includes("expiration date")) {
    return (
      "Verify the product's actual expiration or date information manually " +
      "before making an inventory decision."
    );
  }

  if (type.includes("crystallization")) {
    return (
      "Inspect the product and its storage condition. " +
      "Separate it from normal inventory if crystallization is associated " +
      "with quality deterioration."
    );
  }

  return (
    "The product is classified as rotten. " +
    "Separate it from sellable inventory and conduct further inspection."
  );
}

// ============================================================
// GET HISTORY
// ============================================================

router.get(
  "/history",

  requireAuth,

  async (req, res) => {
    try {
      const records = await SpoilageRecord.find({
        user: req.user._id,
      })
        .sort({
          createdAt: -1,
        })
        .limit(20)
        .lean();

      return res.json({
        success: true,

        count: records.length,

        history: records.map((record) => ({
          id: record._id,

          originalFilename: record.originalFilename,

          imageUrl: record.imageUrl,

          status: record.status,

          prediction: record.prediction,

          treeProbability: record.treeProbability,

          classProbabilities: record.classProbabilities,

          produceValidation: record.produceValidation,

          novelty: record.novelty,

          spoilageType: record.spoilageType,

          spoilageConfidence: record.spoilageConfidence,

          recommendation: record.recommendation,

          message: record.message,

          createdAt: record.createdAt,

          updatedAt: record.updatedAt,
        })),
      });
    } catch (error) {
      console.error("Could not retrieve spoilage history:", error);

      return res.status(500).json({
        success: false,

        message: "Could not retrieve classification history.",
      });
    }
  },
);

// ============================================================
// POST /api/spoilage/analyze
// ============================================================

router.post(
  "/analyze",

  requireAuth,

  handleImageUpload,

  validateUploadedImage,

  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,

        message: "No image was uploaded.",
      });
    }

    console.log("=================================");

    console.log("User:", req.user._id);

    console.log("Image:", req.file.originalname);

    console.log("=================================");

    // ========================================================
    // RUN PERSISTENT ML SERVICE
    // ========================================================

    let mlResult;

    try {
      console.log("Sending image to persistent ML service...");

      const startedAt = Date.now();

      mlResult = await analyzeSpoilageImage(req.file.path);

      const elapsedMs = Date.now() - startedAt;

      console.log(`ML classification completed in ${elapsedMs} ms.`);

      console.log("ML status:", mlResult?.status);
    } catch (error) {
      console.error("ML service error:", error);

      deleteTemporaryImage(req.file.path);

      return res.status(500).json({
        success: false,

        message: "ML pipeline failed.",

        error: error.message,
      });
    }

    // ========================================================
    // ML ERROR
    // ========================================================

    if (mlResult.success === false) {
      deleteTemporaryImage(req.file.path);

      return res.status(500).json({
        success: false,

        message: mlResult.message || "ML analysis failed.",
      });
    }

    // ========================================================
    // NON-PRODUCE
    // ========================================================

    if (mlResult.status === "rejected_non_produce") {
      deleteTemporaryImage(req.file.path);

      return res.json({
        success: true,

        status: "rejected_non_produce",

        prediction: null,

        message: mlResult.message,

        produceValidation: mlResult.produce_validation,

        novelty: null,

        treeProbability: null,

        spoilageType: null,

        spoilageConfidence: null,

        recommendation:
          "Please upload a clear image of a fruit or vegetable product.",
      });
    }

    // ========================================================
    // UNFAMILIAR PRODUCE
    // ========================================================

    if (mlResult.status === "unfamiliar_produce") {
      deleteTemporaryImage(req.file.path);

      return res.json({
        success: true,

        status: "unfamiliar_produce",

        prediction: "Uncertain",

        message: mlResult.message,

        produceValidation: mlResult.produce_validation,

        novelty: mlResult.ood,

        treeProbability: null,

        spoilageType: null,

        spoilageConfidence: null,

        recommendation:
          "The product appears to be produce, but it is outside the model's familiar training range. Manual inspection is recommended.",
      });
    }

    // ========================================================
    // EXPECT CLASSIFIED
    // ========================================================

    if (mlResult.status !== "classified" || !mlResult.spoilage) {
      deleteTemporaryImage(req.file.path);

      return res.status(500).json({
        success: false,

        message: "The ML pipeline returned an unexpected result.",
      });
    }

    const prediction = mlResult.spoilage.prediction;

    const treeProbability = mlResult.spoilage.tree_probability;

    // ========================================================
    // FRESH
    // ========================================================

    if (prediction.toLowerCase() === "fresh") {
      const recommendation = getRecommendation(prediction, null);

      try {
        await saveClassificationHistory({
          req,
          mlResult,
          prediction,
          treeProbability,

          spoilageType: null,

          spoilageConfidence: null,

          recommendation,
        });
      } catch (error) {
        deleteTemporaryImage(req.file.path);

        return res.status(500).json({
          success: false,

          message:
            "Classification succeeded, but the history record could not be saved.",
        });
      }

      deleteTemporaryImage(req.file.path);

      return res.json({
        success: true,

        status: "classified",

        prediction,

        treeProbability,

        classProbabilities: mlResult.spoilage.probabilities,

        produceValidation: mlResult.produce_validation,

        novelty: mlResult.ood,

        spoilageType: null,

        spoilageConfidence: null,

        recommendation,
      });
    }

    // ========================================================
    // ROTTEN
    // ========================================================

    if (prediction.toLowerCase() === "rotten") {
      try {
        const nyckelStartedAt = Date.now();

        const nyckelResult = await predictSpoilageWithNyckel(req.file.path);

        console.log(`Nyckel completed in ${Date.now() - nyckelStartedAt} ms.`);

        const spoilageType =
          nyckelResult.labelName || nyckelResult.label || null;

        const spoilageConfidence = nyckelResult.confidence ?? null;

        const recommendation = getRecommendation(prediction, spoilageType);

        await saveClassificationHistory({
          req,
          mlResult,
          prediction,
          treeProbability,
          spoilageType,
          spoilageConfidence,
          recommendation,
        });

        deleteTemporaryImage(req.file.path);

        return res.json({
          success: true,

          status: "classified",

          prediction,

          treeProbability,

          classProbabilities: mlResult.spoilage.probabilities,

          produceValidation: mlResult.produce_validation,

          novelty: mlResult.ood,

          spoilageType,

          spoilageConfidence,

          recommendation,
        });
      } catch (error) {
        console.error(
          "Rotten classification processing failed:",
          error.response?.data || error.message,
        );

        deleteTemporaryImage(req.file.path);

        return res.status(500).json({
          success: false,

          message: "Rotten classification processing failed.",

          error: error.response?.data || error.message,
        });
      }
    }

    // ========================================================
    // UNKNOWN LABEL
    // ========================================================

    deleteTemporaryImage(req.file.path);

    return res.status(500).json({
      success: false,

      message: "Unknown spoilage classification returned.",

      prediction,
    });
  },
);

module.exports = router;
