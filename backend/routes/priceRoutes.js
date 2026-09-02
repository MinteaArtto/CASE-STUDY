const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const router = express.Router();

// ============================================================
// PROJECT PATHS
//
// Current file:
// CASE_STUDY/backend/routes/priceRoutes.js
//
// ../../ returns to:
// CASE_STUDY/
// ============================================================

const PROJECT_ROOT = path.join(__dirname, "..", "..");

// ============================================================
// FORECAST FILES
// ============================================================

// DA weekly regression forecasts
const DA_FORECAST_FILE = path.join(PROJECT_ROOT, "ml", "price_forecasts.csv");

// WFP monthly regression forecasts
const WFP_FORECAST_FILE = path.join(
  PROJECT_ROOT,
  "ml",
  "wfp_price_forecasts.csv",
);

// ============================================================
// HISTORICAL DATA FILES
// ============================================================

// Trusted DA weekly historical data
const DA_HISTORY_FILE = path.join(
  PROJECT_ROOT,
  "price_data",
  "price_dataset_final.csv",
);

// Clean WFP monthly historical data
const WFP_HISTORY_FILE = path.join(
  PROJECT_ROOT,
  "price_data",
  "price_dataset_wfp.csv",
);

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
// CONVERT VALUE TO NUMBER
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
// FIND PRODUCT
//
// Case-insensitive matching.
//
// Example:
// Tomato
// tomato
// TOMATO
//
// all match.
// ============================================================

function findProduct(rows, product) {
  const searchName = product.trim().toLowerCase();

  return rows.find((row) => {
    if (!row.commodity) {
      return false;
    }

    return row.commodity.trim().toLowerCase() === searchName;
  });
}

// ============================================================
// FILTER PRODUCT HISTORY
// ============================================================

function filterProductRows(rows, product) {
  const searchName = product.trim().toLowerCase();

  return rows.filter((row) => {
    if (!row.commodity) {
      return false;
    }

    return row.commodity.trim().toLowerCase() === searchName;
  });
}

// ============================================================
// PRICE DECISION-SUPPORT SYSTEM
//
// Converts the model forecast into:
// 1. Percentage change
// 2. Trend interpretation
// 3. Pricing suggestion
// 4. Inventory recommendation
//
// Thresholds:
//
// >= +10%     Significant Increase
// +3% to 10%  Increase
// -3% to +3%  Stable
// -10% to -3% Decrease
// <= -10%     Significant Decrease
// ============================================================

function getPriceDecisionSupport(latestPrice, forecastPrice) {
  // --------------------------------------------------------
  // VALIDATE PRICES
  // --------------------------------------------------------

  if (latestPrice === null || forecastPrice === null || latestPrice <= 0) {
    return {
      percentageChange: null,

      trend: "unknown",

      pricingSuggestion:
        "Insufficient price information is available to provide a pricing suggestion.",

      inventoryRecommendation:
        "Insufficient price information is available to provide an inventory recommendation.",
    };
  }

  // --------------------------------------------------------
  // CALCULATE PERCENTAGE CHANGE
  // --------------------------------------------------------

  const percentageChange = ((forecastPrice - latestPrice) / latestPrice) * 100;

  const roundedChange = Math.round(percentageChange * 100) / 100;

  // ========================================================
  // SIGNIFICANT PRICE INCREASE
  // ========================================================

  if (percentageChange >= 10) {
    return {
      percentageChange: roundedChange,

      trend: "significant increase",

      pricingSuggestion:
        "The forecast indicates a significant price increase. Monitor market conditions and consider gradual pricing adjustments while remaining competitive.",

      inventoryRecommendation:
        "Maintain adequate inventory to respond to the expected price increase, but avoid excessive stocking because the product is perishable. Continue monitoring product condition and market prices.",
    };
  }

  // ========================================================
  // MODERATE PRICE INCREASE
  // ========================================================

  if (percentageChange >= 3) {
    return {
      percentageChange: roundedChange,

      trend: "increase",

      pricingSuggestion:
        "The forecast indicates a moderate price increase. Monitor market prices and consider adjusting the selling price gradually if the market trend continues.",

      inventoryRecommendation:
        "Maintain normal inventory levels and monitor the expected price increase before making major stocking decisions.",
    };
  }

  // ========================================================
  // SIGNIFICANT PRICE DECREASE
  // ========================================================

  if (percentageChange <= -10) {
    return {
      percentageChange: roundedChange,

      trend: "significant decrease",

      pricingSuggestion:
        "The forecast indicates a significant price decrease. Consider competitive pricing strategies to encourage faster inventory turnover.",

      inventoryRecommendation:
        "Minimize unnecessary restocking and prioritize moving existing inventory to reduce exposure to the expected price decline.",
    };
  }

  // ========================================================
  // MODERATE PRICE DECREASE
  // ========================================================

  if (percentageChange <= -3) {
    return {
      percentageChange: roundedChange,

      trend: "decrease",

      pricingSuggestion:
        "The forecast indicates a moderate price decrease. Consider maintaining competitive prices and closely monitor market changes.",

      inventoryRecommendation:
        "Prioritize selling existing inventory and consider reducing additional purchases until market prices stabilize.",
    };
  }

  // ========================================================
  // STABLE PRICE
  // ========================================================

  return {
    percentageChange: roundedChange,

    trend: "stable",

    pricingSuggestion:
      "The forecast indicates relatively stable prices. Maintain normal pricing while continuing to monitor market conditions.",

    inventoryRecommendation:
      "Maintain normal inventory levels because no major price movement is currently forecasted.",
  };
}

// ============================================================
// 1. GET AVAILABLE PRODUCTS
//
// GET:
// /api/prices/products
// ============================================================

router.get("/products", async (req, res) => {
  try {
    const [daRows, wfpRows] = await Promise.all([
      readCSV(DA_FORECAST_FILE),
      readCSV(WFP_FORECAST_FILE),
    ]);

    const productMap = new Map();

    // ------------------------------------------------------
    // DA PRODUCTS
    // ------------------------------------------------------

    daRows.forEach((row) => {
      if (!row.commodity) {
        return;
      }

      const name = row.commodity.trim();

      const key = name.toLowerCase();

      if (!productMap.has(key)) {
        productMap.set(key, {
          product: name,
          weeklyAvailable: false,
          monthlyAvailable: false,
        });
      }

      productMap.get(key).weeklyAvailable = true;
    });

    // ------------------------------------------------------
    // WFP PRODUCTS
    // ------------------------------------------------------

    wfpRows.forEach((row) => {
      if (!row.commodity) {
        return;
      }

      const name = row.commodity.trim();

      const key = name.toLowerCase();

      if (!productMap.has(key)) {
        productMap.set(key, {
          product: name,
          weeklyAvailable: false,
          monthlyAvailable: false,
        });
      }

      productMap.get(key).monthlyAvailable = true;
    });

    // ------------------------------------------------------
    // SORT PRODUCTS
    // ------------------------------------------------------

    const products = Array.from(productMap.values()).sort((a, b) =>
      a.product.localeCompare(b.product),
    );

    return res.json({
      success: true,

      count: products.length,

      products,
    });
  } catch (error) {
    console.error("Product list error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to retrieve products.",

      error: error.message,
    });
  }
});

// ============================================================
// 2. GET PRICE FORECAST
//
// GET:
// /api/prices/forecast?product=Tomato
//
// Returns:
//
// weekly
// → DA
// → 1-week forecast
//
// monthly
// → WFP / RiceLytics
// → 1-month forecast
// → 3-month forecast
//
// Also returns:
// → percentage change
// → trend
// → pricing suggestion
// → inventory recommendation
// ============================================================

router.get("/forecast", async (req, res) => {
  try {
    const product = req.query.product;

    // ------------------------------------------------------
    // VALIDATION
    // ------------------------------------------------------

    if (!product) {
      return res.status(400).json({
        success: false,

        message: "Product query parameter is required.",

        example: "/api/prices/forecast?product=Tomato",
      });
    }

    // ------------------------------------------------------
    // READ FORECAST FILES
    // ------------------------------------------------------

    const [daRows, wfpRows] = await Promise.all([
      readCSV(DA_FORECAST_FILE),

      readCSV(WFP_FORECAST_FILE),
    ]);

    // ------------------------------------------------------
    // FIND PRODUCT
    // ------------------------------------------------------

    const daProduct = findProduct(daRows, product);

    const wfpProduct = findProduct(wfpRows, product);

    // ------------------------------------------------------
    // PRODUCT NOT FOUND
    // ------------------------------------------------------

    if (!daProduct && !wfpProduct) {
      return res.status(404).json({
        success: false,

        message: `No forecast data found for ${product}.`,
      });
    }

    // ======================================================
    // DA WEEKLY FORECAST
    // ======================================================

    let weekly = null;

    if (daProduct) {
      const latestWeeklyPrice = toNumber(daProduct.current_price);

      const oneWeekPrice = toNumber(daProduct.one_week_forecast);

      // Generate decision support
      const oneWeekDecision = getPriceDecisionSupport(
        latestWeeklyPrice,
        oneWeekPrice,
      );

      weekly = {
        source: "Department of Agriculture",

        frequency: "weekly",

        latestRecordedPrice: latestWeeklyPrice,

        latestDate: daProduct.latest_date || null,

        oneWeek: {
          date: daProduct.one_week_date || null,

          price: oneWeekPrice,

          direction: daProduct.one_week_direction || null,

          // ----------------------------------------------
          // SOP 5 DECISION-SUPPORT OUTPUT
          // ----------------------------------------------

          percentageChange: oneWeekDecision.percentageChange,

          trend: oneWeekDecision.trend,

          pricingSuggestion: oneWeekDecision.pricingSuggestion,

          inventoryRecommendation: oneWeekDecision.inventoryRecommendation,
        },
      };
    }

    // ======================================================
    // WFP MONTHLY FORECAST
    // ======================================================

    let monthly = null;

    if (wfpProduct) {
      const latestMonthlyPrice = toNumber(wfpProduct.latest_recorded_price);

      const oneMonthPrice = toNumber(wfpProduct.one_month_forecast);

      const threeMonthPrice = toNumber(wfpProduct.three_month_forecast);

      // ----------------------------------------------------
      // 1-MONTH DECISION SUPPORT
      // ----------------------------------------------------

      const oneMonthDecision = getPriceDecisionSupport(
        latestMonthlyPrice,
        oneMonthPrice,
      );

      // ----------------------------------------------------
      // 3-MONTH DECISION SUPPORT
      // ----------------------------------------------------

      const threeMonthDecision = getPriceDecisionSupport(
        latestMonthlyPrice,
        threeMonthPrice,
      );

      monthly = {
        source: "WFP / RiceLytics",

        frequency: "monthly",

        latestRecordedPrice: latestMonthlyPrice,

        latestMonth: wfpProduct.latest_month || null,

        // ==================================================
        // 1-MONTH FORECAST
        // ==================================================

        oneMonth: {
          period: wfpProduct.one_month_period || null,

          price: oneMonthPrice,

          direction: wfpProduct.one_month_direction || null,

          percentageChange: oneMonthDecision.percentageChange,

          trend: oneMonthDecision.trend,

          pricingSuggestion: oneMonthDecision.pricingSuggestion,

          inventoryRecommendation: oneMonthDecision.inventoryRecommendation,
        },

        // ==================================================
        // 3-MONTH FORECAST
        // ==================================================

        threeMonths: {
          period: wfpProduct.three_month_period || null,

          price: threeMonthPrice,

          direction: wfpProduct.three_month_direction || null,

          percentageChange: threeMonthDecision.percentageChange,

          trend: threeMonthDecision.trend,

          pricingSuggestion: threeMonthDecision.pricingSuggestion,

          inventoryRecommendation: threeMonthDecision.inventoryRecommendation,
        },
      };
    }

    // ======================================================
    // FINAL RESPONSE
    // ======================================================

    return res.json({
      success: true,

      product: daProduct?.commodity || wfpProduct?.commodity || product,

      weekly,

      monthly,
    });
  } catch (error) {
    console.error("Price forecast error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to retrieve price forecast.",

      error: error.message,
    });
  }
});

// ============================================================
// 3. GET HISTORICAL PRICE DATA
//
// WEEKLY:
// /api/prices/history?product=Tomato&type=weekly
//
// MONTHLY:
// /api/prices/history?product=Tomato&type=monthly
// ============================================================

router.get("/history", async (req, res) => {
  try {
    const product = req.query.product;

    const type = (req.query.type || "monthly").trim().toLowerCase();

    // ------------------------------------------------------
    // VALIDATE PRODUCT
    // ------------------------------------------------------

    if (!product) {
      return res.status(400).json({
        success: false,

        message: "Product query parameter is required.",

        example: "/api/prices/history?product=Tomato&type=monthly",
      });
    }

    // ------------------------------------------------------
    // VALIDATE TYPE
    // ------------------------------------------------------

    if (type !== "weekly" && type !== "monthly") {
      return res.status(400).json({
        success: false,

        message: "Type must be either weekly or monthly.",
      });
    }

    // ======================================================
    // WEEKLY HISTORY
    // ======================================================

    if (type === "weekly") {
      const rows = await readCSV(DA_HISTORY_FILE);

      const productRows = filterProductRows(rows, product);

      const history = productRows
        .map((row) => ({
          date: row.week_start,

          weekEnd: row.week_end || null,

          price: toNumber(row.weekly_average_price),
        }))
        .filter((row) => {
          return row.date && row.price !== null;
        })
        .sort((a, b) => {
          return new Date(a.date) - new Date(b.date);
        });

      // ----------------------------------------------------
      // NO WEEKLY DATA
      // ----------------------------------------------------

      if (history.length === 0) {
        return res.status(404).json({
          success: false,

          message: `No weekly historical data found for ${product}.`,
        });
      }

      // ----------------------------------------------------
      // WEEKLY RESPONSE
      // ----------------------------------------------------

      return res.json({
        success: true,

        product,

        type: "weekly",

        source: "Department of Agriculture",

        count: history.length,

        firstDate: history[0].date,

        latestDate: history[history.length - 1].date,

        history,
      });
    }

    // ======================================================
    // MONTHLY HISTORY
    // ======================================================

    const rows = await readCSV(WFP_HISTORY_FILE);

    const productRows = filterProductRows(rows, product);

    const history = productRows
      .map((row) => ({
        date: row.date,

        year: row.year ? Number(row.year) : null,

        month: row.month ? Number(row.month) : null,

        price: toNumber(row.monthly_average_price),
      }))
      .filter((row) => {
        return row.date && row.price !== null;
      })
      .sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
      });

    // ------------------------------------------------------
    // NO MONTHLY DATA
    // ------------------------------------------------------

    if (history.length === 0) {
      return res.status(404).json({
        success: false,

        message: `No monthly historical data found for ${product}.`,
      });
    }

    // ------------------------------------------------------
    // MONTHLY RESPONSE
    // ------------------------------------------------------

    return res.json({
      success: true,

      product,

      type: "monthly",

      source: "WFP / RiceLytics",

      count: history.length,

      firstDate: history[0].date,

      latestDate: history[history.length - 1].date,

      history,
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
