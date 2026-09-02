const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const axios = require("axios");

const router = express.Router();

// ============================================================
// UPLOAD FOLDER
// ============================================================

const uploadDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ============================================================
// MULTER CONFIGURATION
// ============================================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: storage,
});

// ============================================================
// NYCKEL AUTHENTICATION
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
// NYCKEL SPOILAGE PREDICTION
// ============================================================

async function predictSpoilageWithNyckel(imagePath) {
  // Get Nyckel access token
  const accessToken = await getNyckelAccessToken();

  // Read image
  const imageBuffer = fs.readFileSync(imagePath);

  // Convert image to Base64 data URI
  const base64Image = imageBuffer.toString("base64");

  const extension = path.extname(imagePath).toLowerCase();

  let mimeType = "image/jpeg";

  if (extension === ".png") {
    mimeType = "image/png";
  } else if (extension === ".webp") {
    mimeType = "image/webp";
  }

  const dataUri = `data:${mimeType};base64,${base64Image}`;

  // Call Nyckel
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
// DECISION-SUPPORT RECOMMENDATIONS
// ============================================================

function getRecommendation(prediction, spoilageType) {
  // ========================================================
  // FRESH PRODUCT
  // ========================================================

  if (prediction?.toLowerCase() === "fresh") {
    return "The product is classified as fresh. Maintain proper handling and continue regular inspection to preserve its quality.";
  }

  // ========================================================
  // UNKNOWN RESULT
  // ========================================================

  if (prediction?.toLowerCase() !== "rotten") {
    return "Inspect the product before making an inventory decision.";
  }

  // Convert Nyckel label to lowercase for easier comparison
  const type = spoilageType?.toLowerCase() || "";

  // ========================================================
  // DRYNESS / SHRINKAGE / WRINKLING
  // ========================================================

  if (
    type.includes("dryness") ||
    type.includes("shrinkage") ||
    type.includes("wrinkling")
  ) {
    return "Inspect the affected product and prioritize it for inventory review due to visible signs of moisture loss and deterioration.";
  }

  // ========================================================
  // DISCOLORATION / COLOR CHANGE
  // ========================================================

  if (type.includes("discoloration") || type.includes("color change")) {
    return "Inspect and separate the affected product from normal inventory and check nearby products for similar visible changes.";
  }

  // ========================================================
  // SOFTNESS / TEXTURAL CHANGE / PITTING
  // ========================================================

  if (
    type.includes("softness") ||
    type.includes("textural change") ||
    type.includes("pitting")
  ) {
    return "Inspect the severity of the deterioration and prioritize the affected product for immediate handling.";
  }

  // ========================================================
  // MOLD / VISIBLE ROT / SLIME / PUS
  // ========================================================

  if (
    type.includes("mold") ||
    type.includes("visible rot") ||
    type.includes("slime") ||
    type.includes("pus")
  ) {
    return "Remove the affected product from sellable inventory and inspect nearby products for similar signs of spoilage.";
  }

  // ========================================================
  // FERMENTATION / LIQUEFACTION
  // ========================================================

  if (type.includes("fermentation") || type.includes("liquefaction")) {
    return "Separate the affected product from sellable inventory and inspect it for further signs of advanced deterioration.";
  }

  // ========================================================
  // FOUL ODOR / SMELL
  // These require manual verification because an image
  // cannot directly confirm odor.
  // ========================================================

  if (type.includes("foul odor") || type === "smell") {
    return "A possible odor-related spoilage indicator was detected. Verify the product manually and remove it from sellable inventory if an abnormal odor is confirmed.";
  }

  // ========================================================
  // EXPIRATION DATE
  // ========================================================

  if (type.includes("expiration date")) {
    return "Verify the product's actual expiration or date information manually before making an inventory decision.";
  }

  // ========================================================
  // CRYSTALLIZATION
  // ========================================================

  if (type.includes("crystallization")) {
    return "Inspect the product and its storage condition. Separate it from normal inventory if crystallization is associated with quality deterioration.";
  }

  // ========================================================
  // FALLBACK
  // ========================================================

  return "The product is classified as rotten. Separate it from sellable inventory and conduct further inspection before handling.";
}

// ============================================================
// POST /api/spoilage/analyze
// ============================================================

router.post("/analyze", upload.single("image"), (req, res) => {
  // ========================================================
  // CHECK IMAGE
  // ========================================================

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No image was uploaded.",
    });
  }

  console.log("=================================");
  console.log("Image received:", req.file.originalname);
  console.log("Saved to:", req.file.path);
  console.log("Image type:", req.file.mimetype);
  console.log("Image size:", req.file.size, "bytes");
  console.log("=================================");

  // ========================================================
  // PYTHON PATH
  // ========================================================

  const pythonPath = path.join(
    __dirname,
    "..",
    "..",
    "ml",
    ".venv",
    "Scripts",
    "python.exe",
  );

  // ========================================================
  // PREDICT.PY PATH
  // ========================================================

  const predictScript = path.join(__dirname, "..", "..", "ml", "predict.py");

  console.log("Python:", pythonPath);
  console.log("Predict script:", predictScript);
  console.log("Starting ML prediction...");

  // ========================================================
  // RUN PYTHON
  // ========================================================

  const python = spawn(pythonPath, [predictScript, req.file.path]);

  let output = "";
  let errorOutput = "";

  // ========================================================
  // PYTHON NORMAL OUTPUT
  // ========================================================

  python.stdout.on("data", (data) => {
    output += data.toString();
  });

  // ========================================================
  // PYTHON ERROR OUTPUT
  // ========================================================

  python.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  // ========================================================
  // PYTHON PROCESS ERROR
  // ========================================================

  python.on("error", (error) => {
    console.error("Could not start Python process:", error.message);

    fs.unlink(req.file.path, () => {});

    return res.status(500).json({
      success: false,
      message: "Could not start the ML prediction process.",
      error: error.message,
    });
  });

  // ========================================================
  // PYTHON FINISHED
  // ========================================================

  python.on("close", async (code) => {
    console.log("Python process finished.");
    console.log("Exit code:", code);

    // ======================================================
    // PYTHON FAILED
    // ======================================================

    if (code !== 0) {
      console.error("Python error:", errorOutput);

      fs.unlink(req.file.path, (err) => {
        if (err) {
          console.error("Could not delete temporary image:", err.message);
        }
      });

      return res.status(500).json({
        success: false,
        message: "ML prediction failed.",
        error: errorOutput,
      });
    }

    console.log("Python output:", output);

    // ======================================================
    // EXTRACT PYTORCH PREDICTION
    // ======================================================

    const predictionMatch = output.match(/Prediction:\s*(Fresh|Rotten)/i);

    // ======================================================
    // EXTRACT PYTORCH CONFIDENCE
    // ======================================================

    const confidenceMatch = output.match(/Confidence:\s*([0-9.]+)/i);

    // ======================================================
    // INVALID PYTHON OUTPUT
    // ======================================================

    if (!predictionMatch || !confidenceMatch) {
      fs.unlink(req.file.path, () => {});

      return res.status(500).json({
        success: false,
        message: "Could not understand the ML prediction.",
        rawOutput: output,
      });
    }

    const prediction = predictionMatch[1];

    const confidence = parseFloat(confidenceMatch[1]);

    console.log("PyTorch prediction:", prediction);

    console.log("PyTorch confidence:", confidence);

    // ======================================================
    // FRESH → DO NOT CALL NYCKEL
    // ======================================================

    if (prediction.toLowerCase() === "fresh") {
      console.log("Food is fresh. Nyckel will NOT be called.");

      // Generate fresh recommendation
      const recommendation = getRecommendation(prediction, null);

      console.log("Recommendation:", recommendation);

      // Delete temporary image
      fs.unlink(req.file.path, (err) => {
        if (err) {
          console.error("Could not delete temporary image:", err.message);
        } else {
          console.log("Temporary image deleted.");
        }
      });

      return res.json({
        success: true,

        prediction: prediction,

        confidence: confidence,

        spoilageType: null,

        spoilageConfidence: null,

        recommendation: recommendation,
      });
    }

    // ======================================================
    // ROTTEN → CALL NYCKEL
    // ======================================================

    console.log("Food is rotten.");

    console.log("Calling Nyckel for spoilage identification...");

    try {
      // ====================================================
      // GET NYCKEL RESULT
      // ====================================================

      const nyckelResult = await predictSpoilageWithNyckel(req.file.path);

      console.log("Nyckel result:", nyckelResult);

      // ====================================================
      // EXTRACT NYCKEL VALUES
      // ====================================================

      const spoilageType = nyckelResult.labelName || nyckelResult.label || null;

      const spoilageConfidence = nyckelResult.confidence ?? null;

      console.log("Spoilage type:", spoilageType);

      console.log("Spoilage confidence:", spoilageConfidence);

      // ====================================================
      // GENERATE RECOMMENDATION
      // ====================================================

      const recommendation = getRecommendation(prediction, spoilageType);

      console.log("Recommendation:", recommendation);

      // ====================================================
      // DELETE TEMPORARY IMAGE
      // ====================================================

      fs.unlink(req.file.path, (err) => {
        if (err) {
          console.error("Could not delete temporary image:", err.message);
        } else {
          console.log("Temporary image deleted.");
        }
      });

      // ====================================================
      // RETURN COMBINED RESULT
      // ====================================================

      return res.json({
        success: true,

        // PyTorch result
        prediction: prediction,

        confidence: confidence,

        // Nyckel result
        spoilageType: spoilageType,

        spoilageConfidence: spoilageConfidence,

        // Decision-support result
        recommendation: recommendation,
      });
    } catch (nyckelError) {
      console.error(
        "Nyckel prediction failed:",
        nyckelError.response?.data || nyckelError.message,
      );

      // ====================================================
      // DELETE TEMPORARY IMAGE
      // ====================================================

      fs.unlink(req.file.path, () => {});

      // ====================================================
      // NYCKEL ERROR
      // ====================================================

      return res.status(500).json({
        success: false,
        message: "Nyckel spoilage prediction failed.",
        error: nyckelError.response?.data || nyckelError.message,
      });
    }
  });
});

module.exports = router;
