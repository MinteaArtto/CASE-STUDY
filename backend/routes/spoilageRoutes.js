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
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
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
// DELETE TEMPORARY IMAGE
// ============================================================

function deleteTemporaryImage(imagePath) {
  fs.unlink(imagePath, (error) => {
    if (error) {
      console.error("Could not delete temporary image:", error.message);
    } else {
      console.log("Temporary image deleted.");
    }
  });
}

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
// DECISION-SUPPORT RECOMMENDATIONS
// ============================================================

function getRecommendation(prediction, spoilageType) {
  // ========================================================
  // FRESH
  // ========================================================

  if (prediction?.toLowerCase() === "fresh") {
    return (
      "The product is classified as fresh. " +
      "Maintain proper handling and continue " +
      "regular inspection to preserve its quality."
    );
  }

  // ========================================================
  // UNKNOWN RESULT
  // ========================================================

  if (prediction?.toLowerCase() !== "rotten") {
    return "Inspect the product before making " + "an inventory decision.";
  }

  // ========================================================
  // ROTTEN
  // ========================================================

  const type = spoilageType?.toLowerCase() || "";

  // ========================================================
  // DRYNESS / SHRINKAGE / WRINKLING
  // ========================================================

  if (
    type.includes("dryness") ||
    type.includes("shrinkage") ||
    type.includes("wrinkling")
  ) {
    return (
      "Inspect the affected product and prioritize " +
      "it for inventory review due to visible " +
      "signs of moisture loss and deterioration."
    );
  }

  // ========================================================
  // DISCOLORATION / COLOR CHANGE
  // ========================================================

  if (type.includes("discoloration") || type.includes("color change")) {
    return (
      "Inspect and separate the affected product " +
      "from normal inventory and check nearby " +
      "products for similar visible changes."
    );
  }

  // ========================================================
  // SOFTNESS / TEXTURAL CHANGE / PITTING
  // ========================================================

  if (
    type.includes("softness") ||
    type.includes("textural change") ||
    type.includes("pitting")
  ) {
    return (
      "Inspect the severity of the deterioration " +
      "and prioritize the affected product for " +
      "immediate handling."
    );
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
    return (
      "Remove the affected product from sellable " +
      "inventory and inspect nearby products for " +
      "similar signs of spoilage."
    );
  }

  // ========================================================
  // FERMENTATION / LIQUEFACTION
  // ========================================================

  if (type.includes("fermentation") || type.includes("liquefaction")) {
    return (
      "Separate the affected product from sellable " +
      "inventory and inspect it for further signs " +
      "of advanced deterioration."
    );
  }

  // ========================================================
  // FOUL ODOR / SMELL
  //
  // Image analysis cannot directly confirm odor.
  // ========================================================

  if (type.includes("foul odor") || type === "smell") {
    return (
      "A possible odor-related spoilage indicator " +
      "was detected. Verify the product manually " +
      "and remove it from sellable inventory if " +
      "an abnormal odor is confirmed."
    );
  }

  // ========================================================
  // EXPIRATION DATE
  // ========================================================

  if (type.includes("expiration date")) {
    return (
      "Verify the product's actual expiration or " +
      "date information manually before making " +
      "an inventory decision."
    );
  }

  // ========================================================
  // CRYSTALLIZATION
  // ========================================================

  if (type.includes("crystallization")) {
    return (
      "Inspect the product and its storage condition. " +
      "Separate it from normal inventory if " +
      "crystallization is associated with quality " +
      "deterioration."
    );
  }

  // ========================================================
  // FALLBACK
  // ========================================================

  return (
    "The product is classified as rotten. " +
    "Separate it from sellable inventory and " +
    "conduct further inspection before handling."
  );
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
  // NEW COMPLETE ML PIPELINE
  // ========================================================

  const pipelineScript = path.join(
    __dirname,
    "..",
    "..",
    "ml",
    "analyze_spoilage_pipeline.py",
  );

  console.log("Python:", pythonPath);

  console.log("Pipeline script:", pipelineScript);

  console.log("Starting spoilage pipeline...");

  // ========================================================
  // RUN PYTHON
  // ========================================================

  const python = spawn(pythonPath, [pipelineScript, req.file.path]);

  let output = "";
  let errorOutput = "";

  // ========================================================
  // PYTHON STDOUT
  // ========================================================

  python.stdout.on("data", (data) => {
    output += data.toString();
  });

  // ========================================================
  // PYTHON STDERR
  //
  // Hugging Face warnings may appear here even when the
  // prediction succeeds.
  // ========================================================

  python.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  // ========================================================
  // PYTHON PROCESS ERROR
  // ========================================================

  python.on("error", (error) => {
    console.error("Could not start Python process:", error.message);

    deleteTemporaryImage(req.file.path);

    return res.status(500).json({
      success: false,

      message: "Could not start the ML pipeline.",

      error: error.message,
    });
  });

  // ========================================================
  // PYTHON FINISHED
  // ========================================================

  python.on("close", async (code) => {
    console.log("Python process finished.");

    console.log("Exit code:", code);

    // ====================================================
    // PYTHON FAILED
    // ====================================================

    if (code !== 0) {
      console.error("Python error:", errorOutput);

      deleteTemporaryImage(req.file.path);

      return res.status(500).json({
        success: false,

        message: "ML pipeline failed.",

        error: errorOutput,
      });
    }

    console.log("Python output:", output);

    // ====================================================
    // PARSE JSON OUTPUT
    // ====================================================

    let mlResult;

    try {
      const lines = output
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim());

      let parsed = null;

      // Search from the final line backwards.
      // This protects us if Python prints another
      // harmless message before the JSON.
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          parsed = JSON.parse(lines[i]);

          break;
        } catch {
          // Continue searching upward.
        }
      }

      if (!parsed) {
        throw new Error("No valid JSON result was returned.");
      }

      mlResult = parsed;
    } catch (parseError) {
      console.error("Could not parse ML output:", parseError.message);

      deleteTemporaryImage(req.file.path);

      return res.status(500).json({
        success: false,

        message: "Could not understand the ML pipeline result.",

        rawOutput: output,

        error: parseError.message,
      });
    }

    console.log("ML status:", mlResult.status);

    // ====================================================
    // ML SCRIPT RETURNED ERROR
    // ====================================================

    if (mlResult.success === false) {
      deleteTemporaryImage(req.file.path);

      return res.status(500).json({
        success: false,

        message: mlResult.message || "ML analysis failed.",
      });
    }

    // ====================================================
    // NON-PRODUCE
    //
    // CLIP stops the request before KNN / Decision Tree.
    // ====================================================

    if (mlResult.status === "rejected_non_produce") {
      console.log("Image rejected as non-produce.");

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

    // ====================================================
    // UNFAMILIAR PRODUCE
    //
    // CLIP accepted it as produce, but its CNN feature
    // representation falls outside the calibrated p99
    // KNN range.
    // ====================================================

    if (mlResult.status === "unfamiliar_produce") {
      console.log("Produce detected, but image is outside familiar ML range.");

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
          "The product appears to be produce, " +
          "but it is outside the model's familiar " +
          "training range. Manual inspection is " +
          "recommended.",
      });
    }

    // ====================================================
    // EXPECT CLASSIFIED RESULT
    // ====================================================

    if (mlResult.status !== "classified" || !mlResult.spoilage) {
      console.error("Unexpected ML result:", mlResult);

      deleteTemporaryImage(req.file.path);

      return res.status(500).json({
        success: false,

        message: "The ML pipeline returned an unexpected result.",

        mlResult: mlResult,
      });
    }

    // ====================================================
    // EXTRACT DECISION TREE RESULT
    // ====================================================

    const prediction = mlResult.spoilage.prediction;

    const treeProbability = mlResult.spoilage.tree_probability;

    console.log("Decision Tree prediction:", prediction);

    console.log("Decision Tree probability:", treeProbability);

    console.log("Novelty level:", mlResult.ood?.novelty_level);

    // ====================================================
    // FRESH
    //
    // DO NOT CALL NYCKEL.
    // ====================================================

    if (prediction.toLowerCase() === "fresh") {
      console.log("Product classified as Fresh.");

      console.log("Nyckel will NOT be called.");

      const recommendation = getRecommendation(prediction, null);

      deleteTemporaryImage(req.file.path);

      return res.json({
        success: true,

        status: "classified",

        prediction: prediction,

        // Decision Tree probability.
        // Do not describe this as calibrated confidence.
        treeProbability: treeProbability,

        classProbabilities: mlResult.spoilage.probabilities,

        produceValidation: mlResult.produce_validation,

        novelty: mlResult.ood,

        spoilageType: null,

        spoilageConfidence: null,

        recommendation: recommendation,
      });
    }

    // ====================================================
    // ROTTEN
    //
    // CALL NYCKEL FOR VISIBLE SPOILAGE INDICATOR.
    // ====================================================

    if (prediction.toLowerCase() === "rotten") {
      console.log("Product classified as Rotten.");

      console.log("Calling Nyckel for spoilage identification...");

      try {
        // =================================================
        // NYCKEL RESULT
        // =================================================

        const nyckelResult = await predictSpoilageWithNyckel(req.file.path);

        console.log("Nyckel result:", nyckelResult);

        // =================================================
        // EXTRACT NYCKEL VALUES
        // =================================================

        const spoilageType =
          nyckelResult.labelName || nyckelResult.label || null;

        const spoilageConfidence = nyckelResult.confidence ?? null;

        console.log("Spoilage type:", spoilageType);

        console.log("Spoilage confidence:", spoilageConfidence);

        // =================================================
        // RECOMMENDATION
        // =================================================

        const recommendation = getRecommendation(prediction, spoilageType);

        // =================================================
        // DELETE TEMP IMAGE
        // =================================================

        deleteTemporaryImage(req.file.path);

        // =================================================
        // FINAL RESULT
        // =================================================

        return res.json({
          success: true,

          status: "classified",

          prediction: prediction,

          treeProbability: treeProbability,

          classProbabilities: mlResult.spoilage.probabilities,

          produceValidation: mlResult.produce_validation,

          novelty: mlResult.ood,

          spoilageType: spoilageType,

          spoilageConfidence: spoilageConfidence,

          recommendation: recommendation,
        });
      } catch (nyckelError) {
        console.error(
          "Nyckel prediction failed:",
          nyckelError.response?.data || nyckelError.message,
        );

        deleteTemporaryImage(req.file.path);

        return res.status(500).json({
          success: false,

          message: "Nyckel spoilage prediction failed.",

          error: nyckelError.response?.data || nyckelError.message,
        });
      }
    }

    // ====================================================
    // UNEXPECTED DECISION TREE LABEL
    // ====================================================

    deleteTemporaryImage(req.file.path);

    return res.status(500).json({
      success: false,

      message: "Unknown spoilage classification returned.",

      prediction: prediction,
    });
  });
});

module.exports = router;
