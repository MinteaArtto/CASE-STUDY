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
// POST /api/spoilage/analyze
// ============================================================

router.post("/analyze", upload.single("image"), (req, res) => {
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

  // Python normal output
  python.stdout.on("data", (data) => {
    output += data.toString();
  });

  // Python errors
  python.stderr.on("data", (data) => {
    errorOutput += data.toString();
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
      });
    }

    // ======================================================
    // ROTTEN → CALL NYCKEL
    // ======================================================

    console.log("Food is rotten.");
    console.log("Calling Nyckel for spoilage identification...");

    try {
      const nyckelResult = await predictSpoilageWithNyckel(req.file.path);

      console.log("Nyckel result:", nyckelResult);

      // Delete temporary image
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

        prediction: prediction,

        confidence: confidence,

        spoilageType: nyckelResult.labelName || nyckelResult.label || null,

        spoilageConfidence: nyckelResult.confidence || null,
      });
    } catch (nyckelError) {
      console.error(
        "Nyckel prediction failed:",
        nyckelError.response?.data || nyckelError.message,
      );

      // Delete temporary image
      fs.unlink(req.file.path, () => {});

      return res.status(500).json({
        success: false,
        message: "Nyckel spoilage prediction failed.",
        error: nyckelError.response?.data || nyckelError.message,
      });
    }
  });
});

module.exports = router;
