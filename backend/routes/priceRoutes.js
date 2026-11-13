const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const csv = require("csv-parser");

const router = express.Router();

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const PRICE_DATASET = path.join(
  PROJECT_ROOT,
  "price_data",
  "da_weekly_model_final.csv",
);

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

function readPriceHistory(seriesKey) {
  return new Promise((resolve, reject) => {
    const records = [];
    const source = fs.createReadStream(PRICE_DATASET);
    const parser = csv({
      mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").trim(),
    });

    source.on("error", reject);
    parser.on("error", reject);
    parser.on("data", (row) => {
      if (row.series_key !== seriesKey) return;

      const price = Number(row.weekly_average_price);
      if (!row.week_start || !Number.isFinite(price) || price <= 0) return;

      records.push({
        weekStart: row.week_start,
        weekEnd: row.week_end || null,
        year: Number(row.year),
        category: row.category_normalized || row.category_raw,
        commodity: row.commodity_normalized || row.commodity_raw,
        specification:
          row.specification_normalized ||
          row.specification_raw ||
          "(no specification)",
        unit: row.unit,
        currency: row.currency || "PHP",
        price,
        dataQualityFlag: row.data_quality_flag || null,
        sourceFile: row.source_file || null,
      });
    });
    parser.on("end", () => {
      records.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      resolve(records);
    });

    source.pipe(parser);
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

    const records = await readPriceHistory(seriesKey.trim());

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

      currency: records[0].currency,

      count: records.length,

      firstDate: records[0].weekStart,

      latestDate: records[records.length - 1].weekStart,

      history: records.map((record) => ({
        weekStart: record.weekStart,
        weekEnd: record.weekEnd,
        year: record.year,
        price: record.price,
        dataQualityFlag: record.dataQualityFlag,
        sourceFile: record.sourceFile,
      })),
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
