const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { spawn } = require("child_process");

const router = express.Router();

// ============================================================
// PROJECT PATHS
// ============================================================

const PROJECT_ROOT = path.join(__dirname, "..", "..");

const PREDICT_SCRIPT = path.join(PROJECT_ROOT, "ml", "predict_price.py");

const HISTORY_FILE = path.join(
  PROJECT_ROOT,
  "price_data",
  "da_weekly_model_final.csv",
);

// ============================================================
// PYTHON PATH
// ============================================================

const PYTHON_PATH =
  process.platform === "win32"
    ? path.join(PROJECT_ROOT, "ml", ".venv", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, "ml", ".venv", "bin", "python");

// ============================================================
// RUN PYTHON
// ============================================================

function runPython(args) {
  return new Promise((resolve, reject) => {
    const python = spawn(PYTHON_PATH, [PREDICT_SCRIPT, ...args], {
      cwd: PROJECT_ROOT,

      env: {
        ...process.env,

        // Needed for DA names containing
        // Unicode characters such as ᵃ.
        PYTHONIOENCODING: "utf-8",
      },
    });

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString("utf8");
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString("utf8");
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
// READ CSV
// ============================================================

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];

    if (!fs.existsSync(filePath)) {
      return reject(new Error(`CSV file not found: ${filePath}`));
    }

    fs.createReadStream(filePath)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").trim(),
        }),
      )
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", () => {
        resolve(rows);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

// ============================================================
// NUMBER HELPER
// ============================================================

function toNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return null;
  }

  return number;
}

// ============================================================
// 1. GET CURRENT DA PRODUCT CATALOG
//
// GET /api/prices/products
//
// Returns all 100 current DA entries.
// ============================================================

router.get("/products", async (req, res) => {
  try {
    const products = await runPython(["--products"]);

    const forecastableCount = products.filter(
      (product) => product.forecast_available === true,
    ).length;

    const unavailableCount = products.filter(
      (product) => product.forecast_available === false,
    ).length;

    return res.json({
      success: true,

      count: products.length,

      forecastableCount,

      unavailableCount,

      products,
    });
  } catch (error) {
    console.error("Price product list error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to retrieve current price products.",

      error: error.message,
    });
  }
});

// ============================================================
// 2. GET PRICE FORECAST
//
// POST /api/prices/forecast
//
// BODY:
// {
//   "seriesKey": "..."
// }
// ============================================================

router.post("/forecast", async (req, res) => {
  try {
    const { seriesKey } = req.body;

    // ------------------------------------------------------
    // VALIDATE
    // ------------------------------------------------------

    if (!seriesKey || typeof seriesKey !== "string" || !seriesKey.trim()) {
      return res.status(400).json({
        success: false,

        message: "seriesKey is required.",
      });
    }

    // ------------------------------------------------------
    // FORECAST
    // ------------------------------------------------------

    const forecast = await runPython(["--forecast", seriesKey.trim()]);

    return res.json({
      success: true,

      forecast,
    });
  } catch (error) {
    console.error("Price forecast error:", error);

    const message = error.message || "";

    const lowerMessage = message.toLowerCase();

    // ------------------------------------------------------
    // EXPECTED DATA ERRORS
    // ------------------------------------------------------

    if (
      lowerMessage.includes("no records found") ||
      lowerMessage.includes("at least 16") ||
      lowerMessage.includes("historical data") ||
      lowerMessage.includes("historical records") ||
      lowerMessage.includes("insufficient historical data") ||
      lowerMessage.includes("not part of the current")
    ) {
      return res.status(400).json({
        success: false,

        message,
      });
    }

    // ------------------------------------------------------
    // UNEXPECTED ERROR
    // ------------------------------------------------------

    return res.status(500).json({
      success: false,

      message: "Failed to generate price forecast.",

      error: message,
    });
  }
});

// ============================================================
// 3. GET PRICE HISTORY
//
// GET:
// /api/prices/history?seriesKey=...
//
// Historical values come from the same cleaned/canonical
// dataset used for the forecasting model.
// ============================================================

router.get("/history", async (req, res) => {
  try {
    const { seriesKey } = req.query;

    // ------------------------------------------------------
    // VALIDATE
    // ------------------------------------------------------

    if (!seriesKey || typeof seriesKey !== "string" || !seriesKey.trim()) {
      return res.status(400).json({
        success: false,

        message: "seriesKey query parameter is required.",
      });
    }

    // ------------------------------------------------------
    // READ CLEANED CURRENT-CATALOG DATASET
    // ------------------------------------------------------

    const rows = await readCSV(HISTORY_FILE);

    const matchingRows = rows
      .filter((row) => row.series_key === seriesKey.trim())
      .map((row) => ({
        weekStart: row.week_start,

        weekEnd: row.week_end || null,

        year: row.year ? Number(row.year) : null,

        price: toNumber(row.weekly_average_price),
      }))
      .filter((row) => row.weekStart && row.price !== null)
      .sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

    // ------------------------------------------------------
    // FIND PRODUCT INFORMATION
    // ------------------------------------------------------

    const firstMatchingRow = rows.find(
      (row) => row.series_key === seriesKey.trim(),
    );

    // ------------------------------------------------------
    // NO HISTORY
    //
    // This is a valid condition for current commodities
    // that have no historical numeric observations yet.
    // ------------------------------------------------------

    if (matchingRows.length === 0) {
      return res.json({
        success: true,

        seriesKey: seriesKey.trim(),

        category: null,

        commodity: null,

        specification: null,

        unit: null,

        count: 0,

        firstDate: null,

        latestDate: null,

        history: [],
      });
    }

    // ------------------------------------------------------
    // RESPONSE
    // ------------------------------------------------------

    return res.json({
      success: true,

      seriesKey: seriesKey.trim(),

      category: firstMatchingRow?.category_normalized || null,

      commodity: firstMatchingRow?.commodity_normalized || null,

      specification: firstMatchingRow?.specification_normalized || null,

      unit: firstMatchingRow?.unit || null,

      count: matchingRows.length,

      firstDate: matchingRows[0]?.weekStart || null,

      latestDate: matchingRows[matchingRows.length - 1]?.weekStart || null,

      history: matchingRows,
    });
  } catch (error) {
    console.error("Price history error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to retrieve price history.",

      error: error.message,
    });
  }
});

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;
