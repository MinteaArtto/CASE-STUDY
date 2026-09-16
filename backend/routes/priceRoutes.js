const express = require("express");
const path = require("path");
const { spawn } = require("child_process");

const router = express.Router();

const PROJECT_ROOT = path.join(__dirname, "..", "..");

const PREDICT_SCRIPT = path.join(PROJECT_ROOT, "ml", "predict_price.py");

// Use the project's Python virtual environment when available.
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

      // Important for Windows:
      // force UTF-8 so names such as
      // "P20 Benteng Bigas Meron Naᵃ"
      // can be returned safely.
      env: {
        ...process.env,
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
// 1. GET CURRENT DA PRODUCT CATALOG
//
// GET:
// /api/prices/products
//
// Returns all 100 current DA entries.
//
// Each product includes:
// - series_key
// - category
// - commodity
// - specification
// - unit
// - record_count
// - forecast_available
// - forecast_status
// - forecast_message
// - latest numeric price/date
// - latest PDF price/status
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
// POST:
// /api/prices/forecast
//
// BODY:
//
// {
//   "seriesKey":
//   "HIGHLAND VEGETABLES | Broccoli, Local |
//    Medium (8-10 cm diameter/bunch hd) | kg"
// }
//
// Returns:
// - latest usable price
// - 1-week forecast
// - 2-week forecast
// - 4-week forecast
// ============================================================

router.post("/forecast", async (req, res) => {
  try {
    const { seriesKey } = req.body;

    // ------------------------------------------------------
    // VALIDATE BODY
    // ------------------------------------------------------

    if (!seriesKey || typeof seriesKey !== "string" || !seriesKey.trim()) {
      return res.status(400).json({
        success: false,

        message: "seriesKey is required.",
      });
    }

    // ------------------------------------------------------
    // RUN PYTHON FORECAST
    // ------------------------------------------------------

    const forecast = await runPython(["--forecast", seriesKey.trim()]);

    // ------------------------------------------------------
    // SUCCESS RESPONSE
    // ------------------------------------------------------

    return res.json({
      success: true,

      forecast,
    });
  } catch (error) {
    console.error("Price forecast error:", error);

    const message = error.message || "";

    const lowerMessage = message.toLowerCase();

    // ------------------------------------------------------
    // EXPECTED CLIENT / DATA ERRORS
    //
    // These are NOT server crashes.
    // They simply mean the selected commodity cannot
    // currently be forecast.
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
    // UNEXPECTED SERVER / MODEL ERROR
    // ------------------------------------------------------

    return res.status(500).json({
      success: false,

      message: "Failed to generate price forecast.",

      error: message,
    });
  }
});

module.exports = router;
