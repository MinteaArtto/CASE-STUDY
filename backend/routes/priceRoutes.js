const express = require("express");
const path = require("path");
const { spawn } = require("child_process");

const PriceRecord = require("../models/PriceRecord");

const router = express.Router();

const PROJECT_ROOT = path.join(__dirname, "..", "..");

const PREDICT_SCRIPT = path.join(PROJECT_ROOT, "ml", "predict_price.py");

// Use the Python inside your ml virtual environment.
const PYTHON_PATH =
  process.platform === "win32"
    ? path.join(PROJECT_ROOT, "ml", ".venv", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, "ml", ".venv", "bin", "python");

// ============================================================
// RUN PYTHON SCRIPT
// ============================================================

function runPython(args) {
  return new Promise((resolve, reject) => {
    const python = spawn(PYTHON_PATH, [PREDICT_SCRIPT, ...args], {
      cwd: PROJECT_ROOT,
    });

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("error", (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });

    python.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(stderr.trim() || `Python exited with code ${code}`),
        );
      }

      try {
        const result = JSON.parse(stdout.trim());

        resolve(result);
      } catch (error) {
        reject(new Error(`Python returned invalid JSON: ${stdout}`));
      }
    });
  });
}

// ============================================================
// 1. GET AVAILABLE FORECASTABLE PRODUCTS
//
// GET:
// /api/prices/products
// ============================================================

router.get("/products", async (req, res) => {
  try {
    const products = await runPython(["--products"]);

    return res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Price product list error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve forecastable products.",
      error: error.message,
    });
  }
});

// ============================================================
// 2. GET PRICE FORECAST
//
// POST:
// /api/prices/forecast
//
// Body:
// {
//   "seriesKey":
//   "HIGHLAND VEGETABLES | Broccoli, Local | Medium (8-10 cm diameter/bunch hd) | kg"
// }
// ============================================================

router.post("/forecast", async (req, res) => {
  try {
    const { seriesKey } = req.body;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!seriesKey || !seriesKey.trim()) {
      return res.status(400).json({
        success: false,
        message: "seriesKey is required.",
      });
    }

    // --------------------------------------------------------
    // CALL PYTHON FORECAST SCRIPT
    // --------------------------------------------------------

    const forecast = await runPython(["--forecast", seriesKey.trim()]);

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res.json({
      success: true,
      forecast,
    });
  } catch (error) {
    console.error("Price forecast error:", error);

    const message = error.message || "";

    // --------------------------------------------------------
    // USER / DATA ERROR
    // --------------------------------------------------------

    if (
      message.includes("No records found") ||
      message.includes("At least 16") ||
      message.includes("historical records")
    ) {
      return res.status(400).json({
        success: false,
        message,
      });
    }

    // --------------------------------------------------------
    // SERVER ERROR
    // --------------------------------------------------------

    return res.status(500).json({
      success: false,
      message: "Failed to generate price forecast.",
      error: message,
    });
  }
});

// ============================================================
// 3. GET HISTORICAL PRICE RECORDS
//
// GET:
// /api/prices/history?seriesKey=...
//
// Example:
// /api/prices/history?seriesKey=HIGHLAND VEGETABLES | Broccoli, Local | ...
// ============================================================

router.get("/history", async (req, res) => {
  try {
    const { seriesKey } = req.query;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!seriesKey || !seriesKey.trim()) {
      return res.status(400).json({
        success: false,
        message: "seriesKey query parameter is required.",
      });
    }

    // --------------------------------------------------------
    // GET HISTORY FROM MONGODB
    // --------------------------------------------------------

    const records = await PriceRecord.find({
      seriesKey: seriesKey.trim(),
    })
      .sort({
        weekStart: 1,
      })
      .select({
        _id: 0,
        weekStart: 1,
        weekEnd: 1,
        year: 1,
        category: 1,
        commodity: 1,
        specification: 1,
        unit: 1,
        weeklyAveragePrice: 1,
        seriesKey: 1,
      })
      .lean();

    // --------------------------------------------------------
    // NO RECORDS FOUND
    // --------------------------------------------------------

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No historical price records found for this series.",
      });
    }

    // --------------------------------------------------------
    // FORMAT HISTORY
    // --------------------------------------------------------

    const history = records.map((record) => ({
      weekStart: record.weekStart,

      weekEnd: record.weekEnd,

      year: record.year,

      price: record.weeklyAveragePrice,
    }));

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res.json({
      success: true,

      seriesKey: seriesKey.trim(),

      category: records[0].category,

      commodity: records[0].commodity,

      specification: records[0].specification,

      unit: records[0].unit,

      count: records.length,

      firstDate: records[0].weekStart,

      latestDate: records[records.length - 1].weekStart,

      history,
    });
  } catch (error) {
    console.error("Price history error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to retrieve historical prices.",

      error: error.message,
    });
  }
});

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;
