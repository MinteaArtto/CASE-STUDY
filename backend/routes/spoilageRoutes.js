const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

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

  python.on("close", (code) => {
    console.log("Python process finished.");
    console.log("Exit code:", code);

    // Delete temporary image
    fs.unlink(req.file.path, (err) => {
      if (err) {
        console.error("Could not delete temporary image:", err.message);
      } else {
        console.log("Temporary image deleted.");
      }
    });

    // Python failed
    if (code !== 0) {
      console.error("Python error:", errorOutput);

      return res.status(500).json({
        success: false,
        message: "ML prediction failed.",
        error: errorOutput,
      });
    }

    console.log("Python output:", output);

    // ======================================================
    // EXTRACT PREDICTION
    // ======================================================

    const predictionMatch = output.match(/Prediction:\s*(Fresh|Rotten)/i);

    // ======================================================
    // EXTRACT CONFIDENCE
    // ======================================================

    const confidenceMatch = output.match(/Confidence:\s*([0-9.]+)/i);

    if (!predictionMatch || !confidenceMatch) {
      return res.status(500).json({
        success: false,
        message: "Could not understand the ML prediction.",
        rawOutput: output,
      });
    }

    const prediction = predictionMatch[1];

    const confidence = parseFloat(confidenceMatch[1]);

    // ======================================================
    // SEND RESULT TO FRONTEND
    // ======================================================

    return res.json({
      success: true,

      prediction: prediction,

      confidence: confidence,
    });
  });
});

module.exports = router;
