const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const requireAuth = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/adminMiddleware");

const {
  getLatestWeeklyPriceReport,
  checkForPriceUpdate,
} = require("../services/daPriceService");

const router = express.Router();

// ============================================================
// PROJECT PATHS
// ============================================================

const projectRoot = path.join(__dirname, "..", "..");

const pythonPath = path.join(
  projectRoot,
  "ml",
  ".venv",
  "Scripts",
  "python.exe",
);

const previewScriptPath = path.join(
  projectRoot,
  "price_data",
  "preview_price_update.py",
);

const updatePriceCatalogScriptPath = path.join(
  projectRoot,
  "ml",
  "update_price_catalog.py",
);

const trainPriceModelsScriptPath = path.join(
  projectRoot,
  "ml",
  "train_price_models.py",
);

const canonicalPriceCsvPath = path.join(
  projectRoot,
  "price_data",
  "da_weekly_model_final.csv",
);

const currentCatalogCsvPath = path.join(
  projectRoot,
  "price_data",
  "current_catalog_forecast_eligibility.csv",
);

const priceBackupDirectory = path.join(projectRoot, "price_data", "backups");

const modelDirectory = path.join(projectRoot, "ml", "price_models");

const priceModelMetricsPath = path.join(
  projectRoot,
  "ml",
  "price_model_metrics.csv",
);

const priceModelPredictionsPath = path.join(
  projectRoot,
  "ml",
  "price_model_test_predictions.csv",
);

const requiredLiveModelPaths = [
  path.join(modelDirectory, "price_model_1w.joblib"),
  path.join(modelDirectory, "price_model_2w.joblib"),
  path.join(modelDirectory, "price_model_4w.joblib"),
  path.join(modelDirectory, "price_model_metadata.json"),
];

const CANONICAL_PRICE_COLUMNS = [
  "week_start",
  "week_end",
  "year",
  "category_raw",
  "category_normalized",
  "commodity_raw",
  "commodity_normalized",
  "specification_raw",
  "specification_normalized",
  "unit",
  "weekly_average_price",
  "source_file",
  "data_quality_flag",
  "source_readability",
  "series_key",
  "historical_category_normalized",
  "historical_commodity_normalized",
  "historical_specification_normalized",
  "historical_unit",
  "mapping_method",
];

let priceApplyInProgress = false;

// ============================================================
// CUSTOM ERROR
// ============================================================

class ApplyUpdateError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);

    this.name = "ApplyUpdateError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ============================================================
// GENERAL HELPERS
// ============================================================

function getFirstDefined(object, keys) {
  if (!object || typeof object !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      return object[key];
    }
  }

  return undefined;
}

function cleanText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toBoolean(value) {
  if (value === true || value === 1) {
    return true;
  }

  if (typeof value === "string") {
    return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
  }

  return false;
}

// ============================================================
// SERIES IDENTITY
// ============================================================

function normalizeIdentityPart(value) {
  return cleanText(value)
    .replace(/[ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ⁰¹²³⁴⁵⁶⁷⁸⁹]+$/u, "")
    .trim()
    .toLowerCase();
}

function makeSeriesIdentity(category, commodity, specification, unit) {
  return [category, commodity, specification, unit]
    .map(normalizeIdentityPart)
    .join(" | ");
}

function buildNewSeriesKey(category, commodity, specification, unit) {
  return [
    cleanText(category),
    cleanText(commodity),
    cleanText(specification) || "(no specification)",
    cleanText(unit),
  ].join(" | ");
}

// ============================================================
// DATE VALIDATION
// ============================================================

function parseIsoDate(value, fieldName) {
  const text = cleanText(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ApplyUpdateError(400, `${fieldName} must use YYYY-MM-DD format.`);
  }

  const [year, month, day] = text.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ApplyUpdateError(400, `${fieldName} is not a valid date.`);
  }

  return {
    text,
    date,
    year,
  };
}

// ============================================================
// CSV PARSER
// ============================================================

function parseCsvText(csvText) {
  const rows = [];

  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\r" || char === "\n") {
      row.push(field);
      field = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];

      if (char === "\r" && csvText[index + 1] === "\n") {
        index += 1;
      }

      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new ApplyUpdateError(
      500,
      "A CSV file contains an unterminated quoted field.",
    );
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);

    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

// ============================================================
// CSV OBJECT CONVERSION
// ============================================================

function csvRowsToObjects(parsedRows) {
  if (!parsedRows.length) {
    return {
      headers: [],
      rows: [],
    };
  }

  const headers = parsedRows[0].map(cleanText);

  const rows = parsedRows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new ApplyUpdateError(
        500,
        `CSV row ${rowIndex + 2} has ${values.length} columns instead of ${
          headers.length
        }.`,
      );
    }

    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });

  return {
    headers,
    rows,
  };
}

// ============================================================
// CANONICAL HEADER VALIDATION
// ============================================================

function validateCanonicalHeaders(headers) {
  const exactMatch =
    headers.length === CANONICAL_PRICE_COLUMNS.length &&
    CANONICAL_PRICE_COLUMNS.every((column, index) => headers[index] === column);

  if (!exactMatch) {
    throw new ApplyUpdateError(
      500,
      "The canonical price CSV header does not match the expected 20-column structure. No update was applied.",
    );
  }
}

// ============================================================
// LOAD CANONICAL CSV
// ============================================================

function loadCanonicalCsvFromText(rawText) {
  const hasBom = rawText.charCodeAt(0) === 0xfeff;

  const csvText = hasBom ? rawText.slice(1) : rawText;

  const parsedRows = parseCsvText(csvText);

  if (parsedRows.length === 0) {
    throw new ApplyUpdateError(500, "The canonical price CSV is empty.");
  }

  const converted = csvRowsToObjects(parsedRows);

  validateCanonicalHeaders(converted.headers);

  return {
    hasBom,
    headers: converted.headers,
    rows: converted.rows,
  };
}

function loadCanonicalCsv() {
  if (!fs.existsSync(canonicalPriceCsvPath)) {
    throw new ApplyUpdateError(
      500,
      `Canonical price CSV was not found at ${canonicalPriceCsvPath}`,
    );
  }

  const rawText = fs.readFileSync(canonicalPriceCsvPath, "utf8");

  const parsed = loadCanonicalCsvFromText(rawText);

  return {
    ...parsed,
    rawText,
  };
}

// ============================================================
// LOAD CURRENT CATALOG
// ============================================================

function loadCurrentCatalogCsv() {
  if (!fs.existsSync(currentCatalogCsvPath)) {
    throw new ApplyUpdateError(
      500,
      `Current catalog CSV was not found at ${currentCatalogCsvPath}`,
    );
  }

  const rawText = fs.readFileSync(currentCatalogCsvPath, "utf8");

  const hasBom = rawText.charCodeAt(0) === 0xfeff;

  const csvText = hasBom ? rawText.slice(1) : rawText;

  const parsedRows = parseCsvText(csvText);

  if (!parsedRows.length) {
    throw new ApplyUpdateError(500, "The current catalog CSV is empty.");
  }

  const converted = csvRowsToObjects(parsedRows);

  const requiredColumns = [
    "series_key",
    "category",
    "commodity",
    "specification",
    "unit",
  ];

  const missingColumns = requiredColumns.filter(
    (column) => !converted.headers.includes(column),
  );

  if (missingColumns.length > 0) {
    throw new ApplyUpdateError(
      500,
      `The current catalog CSV is missing required columns: ${missingColumns.join(
        ", ",
      )}`,
    );
  }

  return {
    headers: converted.headers,

    rows: converted.rows,
  };
}

// ============================================================
// CSV SERIALIZATION
// ============================================================

function escapeCsvValue(value) {
  const text = value === undefined || value === null ? "" : String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\r") ||
    text.includes("\n") ||
    /^\s|\s$/.test(text)
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function serializeRowsForAppend(headers, rows, lineEnding) {
  if (rows.length === 0) {
    return "";
  }

  return (
    rows
      .map((row) =>
        headers.map((header) => escapeCsvValue(row[header])).join(","),
      )
      .join(lineEnding) + lineEnding
  );
}

// ============================================================
// HISTORICAL SERIES INDEX
// ============================================================

function buildHistoricalSeriesIndexes(existingRows) {
  const bySeriesKey = new Map();

  const identityToSeriesKey = new Map();

  for (const row of existingRows) {
    const seriesKey = cleanText(row.series_key);

    if (!seriesKey) {
      continue;
    }

    const previous = bySeriesKey.get(seriesKey);

    if (
      !previous ||
      cleanText(row.week_start) > cleanText(previous.week_start)
    ) {
      bySeriesKey.set(seriesKey, row);
    }
  }

  for (const [seriesKey, row] of bySeriesKey.entries()) {
    const identity = makeSeriesIdentity(
      row.category_normalized,
      row.commodity_normalized,
      row.specification_normalized,
      row.unit,
    );

    if (!identityToSeriesKey.has(identity)) {
      identityToSeriesKey.set(identity, seriesKey);
    } else if (identityToSeriesKey.get(identity) !== seriesKey) {
      identityToSeriesKey.set(identity, null);
    }
  }

  return {
    bySeriesKey,
    identityToSeriesKey,
  };
}

// ============================================================
// CURRENT CATALOG INDEX
// ============================================================

function buildCurrentCatalogIndexes(catalogRows) {
  const bySeriesKey = new Map();

  const identityToSeriesKey = new Map();

  for (const row of catalogRows) {
    const seriesKey = cleanText(row.series_key);

    if (!seriesKey) {
      continue;
    }

    bySeriesKey.set(seriesKey, row);

    const identity = makeSeriesIdentity(
      row.category,
      row.commodity,
      row.specification,
      row.unit,
    );

    if (!identityToSeriesKey.has(identity)) {
      identityToSeriesKey.set(identity, seriesKey);
    } else if (identityToSeriesKey.get(identity) !== seriesKey) {
      identityToSeriesKey.set(identity, null);
    }
  }

  return {
    bySeriesKey,
    identityToSeriesKey,
  };
}

function buildCombinedSeriesIndexes(canonicalRows, catalogRows) {
  const historical = buildHistoricalSeriesIndexes(canonicalRows);

  const catalog = buildCurrentCatalogIndexes(catalogRows);

  return {
    historicalBySeriesKey: historical.bySeriesKey,

    historicalIdentityToSeriesKey: historical.identityToSeriesKey,

    catalogBySeriesKey: catalog.bySeriesKey,

    catalogIdentityToSeriesKey: catalog.identityToSeriesKey,
  };
}

// ============================================================
// LATEST EXISTING WEEK
// ============================================================

function getLatestExistingWeek(existingRows) {
  let latestStart = "";
  let latestEnd = "";

  for (const row of existingRows) {
    const weekStart = cleanText(row.week_start);

    const weekEnd = cleanText(row.week_end);

    if (!weekStart) {
      continue;
    }

    if (weekStart > latestStart) {
      latestStart = weekStart;

      latestEnd = weekEnd;
    } else if (weekStart === latestStart && weekEnd > latestEnd) {
      latestEnd = weekEnd;
    }
  }

  return {
    weekStart: latestStart,

    weekEnd: latestEnd,
  };
}

// ============================================================
// EXISTING WEEK + SERIES
// ============================================================

function buildExistingWeekSeriesSet(existingRows) {
  const keys = new Set();

  for (const row of existingRows) {
    const weekStart = cleanText(row.week_start);

    const seriesKey = cleanText(row.series_key);

    if (weekStart && seriesKey) {
      keys.add(`${weekStart}|||${seriesKey}`);
    }
  }

  return keys;
}

// ============================================================
// PRICE PARSING
// ============================================================

function parseApprovedPrice(record, recordNumber) {
  const rawValue = getFirstDefined(record, [
    "weeklyAveragePrice",
    "weekly_average_price",
    "price",
  ]);

  if (rawValue === undefined || rawValue === null) {
    return "";
  }

  const text = cleanText(rawValue);

  if (!text) {
    return "";
  }

  if (["n/a", "na", "unavailable", "-", "—"].includes(text.toLowerCase())) {
    return "";
  }

  const numericPrice = Number(text.replace(/,/g, ""));

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new ApplyUpdateError(
      400,
      `Record ${recordNumber} has an invalid weekly average price. Use a positive number, or leave it blank only when the DA report explicitly has no price.`,
    );
  }

  return String(numericPrice);
}

// ============================================================
// NORMALIZE APPROVED RECORD
// ============================================================

function normalizeApprovedRecord(
  record,
  recordIndex,
  reportInfo,
  seriesIndexes,
) {
  const recordNumber = recordIndex + 1;

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new ApplyUpdateError(
      400,
      `Record ${recordNumber} must be a JSON object.`,
    );
  }

  const category = cleanText(
    getFirstDefined(record, [
      "category",
      "categoryRaw",
      "category_raw",
      "categoryNormalized",
      "category_normalized",
    ]),
  );

  const commodity = cleanText(
    getFirstDefined(record, [
      "commodity",
      "commodityRaw",
      "commodity_raw",
      "commodityNormalized",
      "commodity_normalized",
    ]),
  );

  const specification = cleanText(
    getFirstDefined(record, [
      "specification",
      "specificationRaw",
      "specification_raw",
      "specificationNormalized",
      "specification_normalized",
    ]),
  );

  const unit = cleanText(getFirstDefined(record, ["unit"]));

  if (!category) {
    throw new ApplyUpdateError(
      400,
      `Record ${recordNumber} is missing category.`,
    );
  }

  if (!commodity) {
    throw new ApplyUpdateError(
      400,
      `Record ${recordNumber} is missing commodity.`,
    );
  }

  if (!unit) {
    throw new ApplyUpdateError(400, `Record ${recordNumber} is missing unit.`);
  }

  const recordWeekStart = cleanText(
    getFirstDefined(record, ["weekStart", "week_start"]),
  );

  const recordWeekEnd = cleanText(
    getFirstDefined(record, ["weekEnd", "week_end"]),
  );

  if (recordWeekStart && recordWeekStart !== reportInfo.weekStart) {
    throw new ApplyUpdateError(
      400,
      `Record ${recordNumber} weekStart does not match the report weekStart.`,
    );
  }

  if (recordWeekEnd && recordWeekEnd !== reportInfo.weekEnd) {
    throw new ApplyUpdateError(
      400,
      `Record ${recordNumber} weekEnd does not match the report weekEnd.`,
    );
  }

  const needsReview = toBoolean(
    getFirstDefined(record, ["needsReview", "needs_review"]),
  );

  const reviewed = toBoolean(getFirstDefined(record, ["reviewed"]));

  const extractionMethod = cleanText(
    getFirstDefined(record, [
      "extractionMethod",
      "extraction_method",
      "sourceReadability",
      "source_readability",
    ]),
  ).toLowerCase();

  const isOcrRecord =
    needsReview ||
    extractionMethod.includes("ocr") ||
    extractionMethod.includes("image");

  if (isOcrRecord && !reviewed) {
    throw new ApplyUpdateError(
      400,
      `Record ${recordNumber} requires manual OCR review before Apply Update.`,
    );
  }

  const approvedPrice = parseApprovedPrice(record, recordNumber);

  const providedSeriesKey = cleanText(
    getFirstDefined(record, ["seriesKey", "series_key"]),
  );

  const rawCatalogStatus = cleanText(
    getFirstDefined(record, ["catalogStatus", "catalog_status"]),
  ).toLowerCase();

  let catalogStatus = rawCatalogStatus;

  if (!catalogStatus) {
    const existsHistorically =
      Boolean(providedSeriesKey) &&
      seriesIndexes.historicalBySeriesKey.has(providedSeriesKey);

    const existsInCatalog =
      Boolean(providedSeriesKey) &&
      seriesIndexes.catalogBySeriesKey.has(providedSeriesKey);

    catalogStatus = existsHistorically || existsInCatalog ? "existing" : "new";
  }

  if (!["existing", "new"].includes(catalogStatus)) {
    throw new ApplyUpdateError(
      400,
      `Record ${recordNumber} has an invalid catalog status. Use Existing or New.`,
    );
  }

  const approvedIdentity = makeSeriesIdentity(
    category,
    commodity,
    specification,
    unit,
  );

  let outputRow;

  // ==========================================================
  // EXISTING SERIES
  // ==========================================================

  if (catalogStatus === "existing") {
    if (!providedSeriesKey) {
      throw new ApplyUpdateError(
        400,
        `Record ${recordNumber} is marked Existing but has no series_key / seriesKey.`,
      );
    }

    const historicalSeriesRow =
      seriesIndexes.historicalBySeriesKey.get(providedSeriesKey);

    const catalogSeriesRow =
      seriesIndexes.catalogBySeriesKey.get(providedSeriesKey);

    if (!historicalSeriesRow && !catalogSeriesRow) {
      throw new ApplyUpdateError(
        400,
        `Record ${recordNumber} references an Existing series_key that is not present in either the historical canonical CSV or the current catalog. Re-run Preview Update before applying.`,
      );
    }

    if (historicalSeriesRow) {
      const canonicalIdentity = makeSeriesIdentity(
        historicalSeriesRow.category_normalized,
        historicalSeriesRow.commodity_normalized,
        historicalSeriesRow.specification_normalized,
        historicalSeriesRow.unit,
      );

      if (approvedIdentity !== canonicalIdentity) {
        throw new ApplyUpdateError(
          400,
          `Record ${recordNumber} was edited so its identifying fields no longer match its existing historical series_key. Correct the category, commodity, specification, and unit before applying.`,
        );
      }

      outputRow = {
        week_start: reportInfo.weekStart,

        week_end: reportInfo.weekEnd,

        year: String(reportInfo.year),

        category_raw: category,

        category_normalized: cleanText(historicalSeriesRow.category_normalized),

        commodity_raw: commodity,

        commodity_normalized: cleanText(
          historicalSeriesRow.commodity_normalized,
        ),

        specification_raw: specification,

        specification_normalized: cleanText(
          historicalSeriesRow.specification_normalized,
        ),

        unit: cleanText(historicalSeriesRow.unit),

        weekly_average_price: approvedPrice,

        source_file: reportInfo.sourceFile,

        data_quality_flag: isOcrRecord ? "verified_manual_review" : "",

        source_readability: isOcrRecord ? "image_only_verified" : "text_layer",

        series_key: providedSeriesKey,

        historical_category_normalized: cleanText(
          historicalSeriesRow.historical_category_normalized ||
            historicalSeriesRow.category_normalized,
        ),

        historical_commodity_normalized: cleanText(
          historicalSeriesRow.historical_commodity_normalized ||
            historicalSeriesRow.commodity_normalized,
        ),

        historical_specification_normalized: cleanText(
          historicalSeriesRow.historical_specification_normalized ||
            historicalSeriesRow.specification_normalized,
        ),

        historical_unit: cleanText(
          historicalSeriesRow.historical_unit || historicalSeriesRow.unit,
        ),

        mapping_method: cleanText(
          historicalSeriesRow.mapping_method || "mapped_existing_series",
        ),
      };
    } else {
      const catalogIdentity = makeSeriesIdentity(
        catalogSeriesRow.category,
        catalogSeriesRow.commodity,
        catalogSeriesRow.specification,
        catalogSeriesRow.unit,
      );

      if (approvedIdentity !== catalogIdentity) {
        throw new ApplyUpdateError(
          400,
          `Record ${recordNumber} was edited so its identifying fields no longer match its current catalog series_key. Correct the category, commodity, specification, and unit before applying.`,
        );
      }

      const catalogCategory = cleanText(catalogSeriesRow.category);

      const catalogCommodity = cleanText(catalogSeriesRow.commodity);

      const catalogSpecification = cleanText(catalogSeriesRow.specification);

      const catalogUnit = cleanText(catalogSeriesRow.unit);

      outputRow = {
        week_start: reportInfo.weekStart,

        week_end: reportInfo.weekEnd,

        year: String(reportInfo.year),

        category_raw: category,

        category_normalized: catalogCategory,

        commodity_raw: commodity,

        commodity_normalized: catalogCommodity,

        specification_raw: specification,

        specification_normalized: catalogSpecification,

        unit: catalogUnit,

        weekly_average_price: approvedPrice,

        source_file: reportInfo.sourceFile,

        data_quality_flag: isOcrRecord ? "verified_manual_review" : "",

        source_readability: isOcrRecord ? "image_only_verified" : "text_layer",

        series_key: providedSeriesKey,

        historical_category_normalized: catalogCategory,

        historical_commodity_normalized: catalogCommodity,

        historical_specification_normalized: catalogSpecification,

        historical_unit: catalogUnit,

        mapping_method: "mapped_current_catalog_no_history",
      };
    }
  } else {
    // ========================================================
    // NEW SERIES
    // ========================================================

    const generatedSeriesKey = buildNewSeriesKey(
      category,
      commodity,
      specification,
      unit,
    );

    if (seriesIndexes.historicalBySeriesKey.has(generatedSeriesKey)) {
      throw new ApplyUpdateError(
        409,
        `Record ${recordNumber} is marked New but its generated series_key already exists in historical data. Re-run Preview Update.`,
      );
    }

    if (seriesIndexes.catalogBySeriesKey.has(generatedSeriesKey)) {
      throw new ApplyUpdateError(
        409,
        `Record ${recordNumber} is marked New but its generated series_key already exists in the current catalog. Re-run Preview Update.`,
      );
    }

    const historicalIdentityMatch =
      seriesIndexes.historicalIdentityToSeriesKey.get(approvedIdentity);

    if (historicalIdentityMatch) {
      throw new ApplyUpdateError(
        409,
        `Record ${recordNumber} is marked New but matches an existing historical series. Re-run Preview Update so it can use the existing series_key.`,
      );
    }

    const catalogIdentityMatch =
      seriesIndexes.catalogIdentityToSeriesKey.get(approvedIdentity);

    if (catalogIdentityMatch) {
      throw new ApplyUpdateError(
        409,
        `Record ${recordNumber} is marked New but matches an existing current catalog series. Re-run Preview Update so it can use the existing series_key.`,
      );
    }

    outputRow = {
      week_start: reportInfo.weekStart,

      week_end: reportInfo.weekEnd,

      year: String(reportInfo.year),

      category_raw: category,

      category_normalized: category,

      commodity_raw: commodity,

      commodity_normalized: commodity,

      specification_raw: specification,

      specification_normalized: specification,

      unit,

      weekly_average_price: approvedPrice,

      source_file: reportInfo.sourceFile,

      data_quality_flag: isOcrRecord ? "verified_manual_review" : "",

      source_readability: isOcrRecord ? "image_only_verified" : "text_layer",

      series_key: generatedSeriesKey,

      historical_category_normalized: category,

      historical_commodity_normalized: commodity,

      historical_specification_normalized: specification,

      historical_unit: unit,

      mapping_method: `new_series_admin_approved_${reportInfo.weekStart.replace(
        /-/g,
        "_",
      )}`,
    };
  }

  return {
    outputRow,
    catalogStatus,
    isOcrRecord,
  };
}

// ============================================================
// PREPARE COMPLETE APPLY REQUEST
// ============================================================

function prepareApplyUpdate(body, canonicalData, catalogData) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApplyUpdateError(400, "A JSON request body is required.");
  }

  const reportObject =
    body.report && typeof body.report === "object" ? body.report : {};

  const weekStartValue =
    getFirstDefined(reportObject, ["weekStart", "week_start"]) ??
    getFirstDefined(body, ["weekStart", "week_start"]);

  const weekEndValue =
    getFirstDefined(reportObject, ["weekEnd", "week_end"]) ??
    getFirstDefined(body, ["weekEnd", "week_end"]);

  const weekStartInfo = parseIsoDate(weekStartValue, "weekStart");

  const weekEndInfo = parseIsoDate(weekEndValue, "weekEnd");

  if (weekEndInfo.date < weekStartInfo.date) {
    throw new ApplyUpdateError(
      400,
      "weekEnd cannot be earlier than weekStart.",
    );
  }

  const sourceFile = cleanText(
    getFirstDefined(reportObject, ["filename", "sourceFile", "source_file"]) ??
      getFirstDefined(body, ["filename", "sourceFile", "source_file"]),
  );

  if (!sourceFile) {
    throw new ApplyUpdateError(400, "The DA source PDF filename is required.");
  }

  if (
    path.basename(sourceFile) !== sourceFile ||
    !sourceFile.toLowerCase().endsWith(".pdf")
  ) {
    throw new ApplyUpdateError(
      400,
      "The source file must be a PDF filename only, not a path.",
    );
  }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    throw new ApplyUpdateError(
      400,
      "records must be a non-empty array of admin-approved preview rows.",
    );
  }

  if (body.records.length > 1000) {
    throw new ApplyUpdateError(
      400,
      "The apply request contains too many records. Maximum allowed is 1000.",
    );
  }

  const latestExistingWeek = getLatestExistingWeek(canonicalData.rows);

  if (latestExistingWeek.weekEnd) {
    const latestEndInfo = parseIsoDate(
      latestExistingWeek.weekEnd,
      "latest existing week_end",
    );

    if (weekStartInfo.date <= latestEndInfo.date) {
      throw new ApplyUpdateError(
        409,
        `The requested report week starts on ${weekStartInfo.text}, but the canonical CSV already contains data through ${latestExistingWeek.weekEnd}. Apply Update only accepts a newer non-overlapping DA reporting week.`,
      );
    }
  }

  const seriesIndexes = buildCombinedSeriesIndexes(
    canonicalData.rows,
    catalogData.rows,
  );

  const existingWeekSeriesKeys = buildExistingWeekSeriesSet(canonicalData.rows);

  const incomingWeekSeriesKeys = new Set();

  const reportInfo = {
    weekStart: weekStartInfo.text,

    weekEnd: weekEndInfo.text,

    year: weekStartInfo.year,

    sourceFile,
  };

  const preparedRecords = [];

  let existingCount = 0;
  let newCount = 0;
  let ocrCount = 0;
  let unavailablePriceCount = 0;

  for (let index = 0; index < body.records.length; index += 1) {
    const prepared = normalizeApprovedRecord(
      body.records[index],
      index,
      reportInfo,
      seriesIndexes,
    );

    const duplicateKey = `${reportInfo.weekStart}|||${prepared.outputRow.series_key}`;

    if (incomingWeekSeriesKeys.has(duplicateKey)) {
      throw new ApplyUpdateError(
        409,
        `Duplicate incoming record detected for week ${reportInfo.weekStart} and series_key "${prepared.outputRow.series_key}". No CSV changes were made.`,
      );
    }

    if (existingWeekSeriesKeys.has(duplicateKey)) {
      throw new ApplyUpdateError(
        409,
        `The canonical CSV already contains week ${reportInfo.weekStart} and series_key "${prepared.outputRow.series_key}". No CSV changes were made.`,
      );
    }

    incomingWeekSeriesKeys.add(duplicateKey);

    preparedRecords.push(prepared.outputRow);

    if (prepared.catalogStatus === "existing") {
      existingCount += 1;
    } else {
      newCount += 1;
    }

    if (prepared.isOcrRecord) {
      ocrCount += 1;
    }

    if (prepared.outputRow.weekly_average_price === "") {
      unavailablePriceCount += 1;
    }
  }

  return {
    reportInfo,

    preparedRecords,

    latestExistingWeek,

    summary: {
      totalRecords: preparedRecords.length,

      existingRecords: existingCount,

      newRecords: newCount,

      reviewedOcrRecords: ocrCount,

      unavailablePriceRecords: unavailablePriceCount,
    },
  };
}

// ============================================================
// BACKUP PATH
// ============================================================

function formatBackupTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function getUniqueBackupPath() {
  const timestamp = formatBackupTimestamp();

  const baseName = `da_weekly_model_final_${timestamp}`;

  let backupPath = path.join(priceBackupDirectory, `${baseName}.csv`);

  let suffix = 1;

  while (fs.existsSync(backupPath)) {
    backupPath = path.join(priceBackupDirectory, `${baseName}_${suffix}.csv`);

    suffix += 1;
  }

  return backupPath;
}

// ============================================================
// DURABLE WRITE
// ============================================================

function writeFileDurably(filePath, content) {
  const fileDescriptor = fs.openSync(filePath, "w");

  try {
    fs.writeFileSync(fileDescriptor, content, "utf8");

    fs.fsyncSync(fileDescriptor);
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

// ============================================================
// TEMP CSV VALIDATION
// ============================================================

function validateWrittenCanonicalCsv(filePath, expectedRowCount) {
  const text = fs.readFileSync(filePath, "utf8");

  const parsed = loadCanonicalCsvFromText(text);

  if (parsed.rows.length !== expectedRowCount) {
    throw new ApplyUpdateError(
      500,
      `Temporary CSV validation failed. Expected ${expectedRowCount} data rows but found ${parsed.rows.length}.`,
    );
  }
}

// ============================================================
// SAFE CANONICAL REPLACEMENT
// ============================================================

function replaceCanonicalCsvFromTemp(tempPath, backupPath) {
  try {
    fs.renameSync(tempPath, canonicalPriceCsvPath);

    return;
  } catch (error) {
    if (!["EEXIST", "EPERM", "ENOTEMPTY"].includes(error.code)) {
      throw error;
    }
  }

  const rollbackPath = path.join(
    path.dirname(canonicalPriceCsvPath),
    `da_weekly_model_final.pre-replace-${process.pid}-${Date.now()}.csv`,
  );

  let originalMoved = false;

  let replacementInstalled = false;

  try {
    fs.renameSync(canonicalPriceCsvPath, rollbackPath);

    originalMoved = true;

    fs.renameSync(tempPath, canonicalPriceCsvPath);

    replacementInstalled = true;

    try {
      fs.rmSync(rollbackPath, {
        force: true,
      });

      originalMoved = false;
    } catch (cleanupError) {
      console.warn(
        "Could not delete pre-replace rollback file:",
        cleanupError.message,
      );
    }

    return;
  } catch (error) {
    let restored = false;

    try {
      if (replacementInstalled && fs.existsSync(canonicalPriceCsvPath)) {
        fs.rmSync(canonicalPriceCsvPath, {
          force: true,
        });
      }

      if (originalMoved && fs.existsSync(rollbackPath)) {
        fs.renameSync(rollbackPath, canonicalPriceCsvPath);

        restored = true;
        originalMoved = false;
      }
    } catch (rollbackError) {
      console.error(
        "Could not restore the pre-replace canonical CSV directly:",
        rollbackError.message,
      );
    }

    if (!restored && !fs.existsSync(canonicalPriceCsvPath)) {
      try {
        fs.copyFileSync(backupPath, canonicalPriceCsvPath);

        restored = true;
      } catch (backupRestoreError) {
        error.message =
          `${error.message} Automatic restore failed. ` +
          `Keep recovery backup ${backupPath}. ` +
          `Restore error: ${backupRestoreError.message}`;
      }
    }

    throw error;
  }
}

// ============================================================
// SAFE CANONICAL CSV APPEND
// ============================================================

function safelyWriteCanonicalCsv(canonicalData, newRows) {
  fs.mkdirSync(priceBackupDirectory, {
    recursive: true,
  });

  const backupPath = getUniqueBackupPath();

  const tempPath = path.join(
    path.dirname(canonicalPriceCsvPath),
    `da_weekly_model_final.tmp-${process.pid}-${Date.now()}.csv`,
  );

  const combinedRows = [...canonicalData.rows, ...newRows];

  const lineEnding = canonicalData.rawText.includes("\r\n") ? "\r\n" : "\n";

  const baseText = /(?:\r\n|\n)$/.test(canonicalData.rawText)
    ? canonicalData.rawText
    : `${canonicalData.rawText}${lineEnding}`;

  const serializedCsv = `${baseText}${serializeRowsForAppend(
    canonicalData.headers,
    newRows,
    lineEnding,
  )}`;

  fs.copyFileSync(
    canonicalPriceCsvPath,
    backupPath,
    fs.constants.COPYFILE_EXCL,
  );

  try {
    writeFileDurably(tempPath, serializedCsv);

    validateWrittenCanonicalCsv(tempPath, combinedRows.length);

    replaceCanonicalCsvFromTemp(tempPath, backupPath);

    return {
      backupPath,

      finalRowCount: combinedRows.length,
    };
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, {
        force: true,
      });
    }

    throw error;
  }
}

// ============================================================
// GENERIC PYTHON SCRIPT RUNNER
// ============================================================

function runPythonScript({
  label,
  scriptPath,
  args = [],
  cwd,
  timeoutMs = 10 * 60 * 1000,
}) {
  return new Promise((resolve, reject) => {
    console.log(`${label} started.`);

    console.log("Python:", pythonPath);

    console.log("Script:", scriptPath);

    const child = spawn(pythonPath, [scriptPath, ...args], {
      cwd: cwd || path.dirname(scriptPath),

      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;

      try {
        child.kill();
      } catch {
        // Ignore kill failure.
      }

      reject(
        new Error(
          `${label} timed out after ${Math.round(timeoutMs / 60000)} minutes.`,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      const text = data.toString();

      stdout += text;

      process.stdout.write(`[${label}] ${text}`);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();

      stderr += text;

      process.stderr.write(`[${label} stderr] ${text}`);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;

      clearTimeout(timeout);

      reject(new Error(`${label} could not start: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;

      clearTimeout(timeout);

      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `Exit code ${code}`;

        reject(new Error(`${label} failed: ${detail}`));

        return;
      }

      console.log(`${label} completed successfully.`);

      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });
}

// ============================================================
// POST-APPLY PREFLIGHT
// ============================================================

function validatePostApplyPipelineFiles() {
  const requiredFiles = [
    {
      label: "Python virtual environment executable",
      filePath: pythonPath,
    },

    {
      label: "Price catalog update script",
      filePath: updatePriceCatalogScriptPath,
    },

    {
      label: "Price model training script",
      filePath: trainPriceModelsScriptPath,
    },

    {
      label: "Canonical price CSV",
      filePath: canonicalPriceCsvPath,
    },
  ];

  for (const required of requiredFiles) {
    if (!fs.existsSync(required.filePath)) {
      throw new ApplyUpdateError(
        500,
        `${required.label} was not found at ${required.filePath}. The DA update was not applied.`,
      );
    }
  }
}

// ============================================================
// VERIFY CATALOG AFTER REGENERATION
// ============================================================

function verifyRegeneratedCatalog() {
  if (!fs.existsSync(currentCatalogCsvPath)) {
    throw new Error(
      "Catalog regeneration reported success but current_catalog_forecast_eligibility.csv does not exist.",
    );
  }

  const catalogData = loadCurrentCatalogCsv();

  if (catalogData.rows.length === 0) {
    throw new Error("The regenerated current catalog is empty.");
  }

  const requiredExtraColumns = [
    "numeric_observations",
    "forecast_eligible_16_plus",
  ];

  for (const column of requiredExtraColumns) {
    if (!catalogData.headers.includes(column)) {
      throw new Error(
        `The regenerated catalog is missing required column "${column}".`,
      );
    }
  }

  return {
    rowCount: catalogData.rows.length,

    headers: catalogData.headers,
  };
}

// ============================================================
// VERIFY LIVE MODEL FILES
// ============================================================

function verifyLivePriceModelArtifacts() {
  for (const modelPath of requiredLiveModelPaths) {
    if (!fs.existsSync(modelPath)) {
      throw new Error(
        `Required live price model artifact is missing after retraining: ${modelPath}`,
      );
    }

    const stats = fs.statSync(modelPath);

    if (!stats.isFile() || stats.size <= 0) {
      throw new Error(
        `Live price model artifact is invalid or empty: ${modelPath}`,
      );
    }
  }

  if (!fs.existsSync(priceModelMetricsPath)) {
    throw new Error(
      `Price model metrics file is missing after retraining: ${priceModelMetricsPath}`,
    );
  }

  if (!fs.existsSync(priceModelPredictionsPath)) {
    throw new Error(
      `Price model test prediction file is missing after retraining: ${priceModelPredictionsPath}`,
    );
  }

  const metadataPath = path.join(modelDirectory, "price_model_metadata.json");

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

  const horizons = metadata?.horizons;

  if (
    !horizons ||
    Number(horizons["1w"]) !== 1 ||
    Number(horizons["2w"]) !== 2 ||
    Number(horizons["4w"]) !== 4
  ) {
    throw new Error(
      "The activated price model metadata does not contain the expected 1w, 2w, and 4w horizons.",
    );
  }

  return {
    models: [
      "price_model_1w.joblib",
      "price_model_2w.joblib",
      "price_model_4w.joblib",
    ],

    metadata: path.basename(metadataPath),

    metrics: path.basename(priceModelMetricsPath),

    testPredictions: path.basename(priceModelPredictionsPath),

    trainedAt: metadata.trained_at || null,
  };
}

// ============================================================
// AUTOMATIC POST-APPLY PIPELINE
// ============================================================

async function runAutomaticPostApplyPipeline() {
  const result = {
    catalogRegenerated: false,

    modelRetrained: false,

    catalog: null,

    models: null,
  };

  console.log();
  console.log("========================================");

  console.log("AUTOMATIC PRICE POST-APPLY PIPELINE");

  console.log("========================================");

  await runPythonScript({
    label: "Price catalog regeneration",

    scriptPath: updatePriceCatalogScriptPath,

    cwd: path.dirname(updatePriceCatalogScriptPath),

    timeoutMs: 10 * 60 * 1000,
  });

  result.catalog = verifyRegeneratedCatalog();

  result.catalogRegenerated = true;

  console.log("Regenerated catalog rows:", result.catalog.rowCount);

  await runPythonScript({
    label: "Price model retraining",

    scriptPath: trainPriceModelsScriptPath,

    cwd: path.dirname(trainPriceModelsScriptPath),

    timeoutMs: 30 * 60 * 1000,
  });

  result.models = verifyLivePriceModelArtifacts();

  result.modelRetrained = true;

  console.log("Automatic post-apply price pipeline completed successfully.");

  return result;
}

// ============================================================
// PRICE PREVIEW PYTHON RUNNER
// ============================================================

function runPricePreview(pdfPath) {
  return new Promise((resolve, reject) => {
    console.log("Starting DA price preview extraction...");

    console.log("Python:", pythonPath);

    console.log("Preview script:", previewScriptPath);

    console.log("PDF:", pdfPath);

    const python = spawn(pythonPath, [previewScriptPath, pdfPath], {
      cwd: path.dirname(previewScriptPath),

      windowsHide: true,
    });

    let output = "";
    let errorOutput = "";

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    python.on("error", (error) => {
      reject(new Error(`Could not start Python: ${error.message}`));
    });

    python.on("close", (code) => {
      console.log("Price preview Python exit code:", code);

      if (errorOutput.trim()) {
        console.log("Price preview Python stderr:", errorOutput);
      }

      const lines = output
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim());

      let parsedResult = null;

      for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
          parsedResult = JSON.parse(lines[index]);

          break;
        } catch {
          // Keep searching.
        }
      }

      if (code !== 0) {
        const pythonMessage =
          parsedResult?.message ||
          errorOutput.trim() ||
          "Price preview extraction failed.";

        reject(new Error(pythonMessage));

        return;
      }

      if (!parsedResult) {
        reject(
          new Error("The Python preview script did not return valid JSON."),
        );

        return;
      }

      if (parsedResult.success === false) {
        reject(
          new Error(parsedResult.message || "Price preview extraction failed."),
        );

        return;
      }

      resolve(parsedResult);
    });
  });
}

// ============================================================
// TEMP DIRECTORY CLEANUP
// ============================================================

function deleteTemporaryUpdateFolder(folderPath) {
  if (!folderPath) {
    return;
  }

  try {
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, {
        recursive: true,
        force: true,
      });

      console.log("Temporary DA update folder deleted.");
    }
  } catch (error) {
    console.error(
      "Could not delete temporary DA update folder:",
      error.message,
    );
  }
}

// ============================================================
// GET /api/admin/prices/latest-report
// ============================================================

router.get(
  "/latest-report",

  requireAuth,

  requireAdmin,

  async (req, res) => {
    try {
      const report = await getLatestWeeklyPriceReport();

      return res.json({
        success: true,
        report,
      });
    } catch (error) {
      console.error("DA latest report check failed:", error.message);

      return res.status(500).json({
        success: false,

        message: "Could not retrieve the latest DA weekly price report.",

        error: error.message,
      });
    }
  },
);

// ============================================================
// GET /api/admin/prices/check-update
// ============================================================

router.get(
  "/check-update",

  requireAuth,

  requireAdmin,

  async (req, res) => {
    try {
      const updateInfo = await checkForPriceUpdate();

      return res.json({
        success: true,
        ...updateInfo,
      });
    } catch (error) {
      console.error("DA update check failed:", error.message);

      return res.status(500).json({
        success: false,

        message: "Could not check for a new DA weekly price report.",

        error: error.message,
      });
    }
  },
);

// ============================================================
// GET /api/admin/prices/preview-update
// ============================================================

router.get(
  "/preview-update",

  requireAuth,

  requireAdmin,

  async (req, res) => {
    let tempDirectory = null;

    try {
      const latestReport = await getLatestWeeklyPriceReport();

      if (!latestReport?.url) {
        throw new Error("The latest DA report does not have a valid PDF URL.");
      }

      console.log("Latest DA report:", latestReport.title);

      const reportUrl = new URL(
        latestReport.url,
        "https://www.da.gov.ph",
      ).toString();

      console.log("Latest DA PDF URL:", reportUrl);

      const urlObject = new URL(reportUrl);

      let filename = path.basename(urlObject.pathname);

      if (!filename || !filename.toLowerCase().endsWith(".pdf")) {
        throw new Error("Could not determine the DA PDF filename.");
      }

      filename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

      tempDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "mamav-price-update-"),
      );

      const pdfPath = path.join(tempDirectory, filename);

      console.log("Downloading DA PDF...");

      const pdfResponse = await axios.get(reportUrl, {
        responseType: "arraybuffer",

        timeout: 30000,

        maxContentLength: 50 * 1024 * 1024,

        maxBodyLength: 50 * 1024 * 1024,

        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      const pdfBuffer = Buffer.from(pdfResponse.data);

      if (pdfBuffer.length < 5) {
        throw new Error("The downloaded DA PDF is empty.");
      }

      const signature = pdfBuffer.subarray(0, 5).toString("ascii");

      if (signature !== "%PDF-") {
        throw new Error("The downloaded DA file is not a valid PDF.");
      }

      fs.writeFileSync(pdfPath, pdfBuffer);

      console.log("DA PDF downloaded:", pdfPath);

      console.log("DA PDF size:", pdfBuffer.length, "bytes");

      const previewResult = await runPricePreview(pdfPath);

      console.log("DA preview extraction successful.");

      console.log("Records extracted:", previewResult?.records?.length || 0);

      deleteTemporaryUpdateFolder(tempDirectory);

      tempDirectory = null;

      return res.json({
        success: true,

        message: "Latest DA weekly price report was extracted successfully.",

        latestReport: {
          title: latestReport.title,

          url: reportUrl,

          filename,
        },

        report: previewResult.report,

        extraction: previewResult.extraction,

        records: previewResult.records,
      });
    } catch (error) {
      console.error("DA preview update failed:", error.message);

      deleteTemporaryUpdateFolder(tempDirectory);

      return res.status(500).json({
        success: false,

        message: "Could not preview the latest DA weekly price report.",

        error: error.message,
      });
    }
  },
);

// ============================================================
// POST /api/admin/prices/apply-update
//
// FLOW:
//
// Validate
// → dry run if requested
// → preflight
// → backup/write canonical CSV
// → regenerate catalog
// → safe model retraining
// → verify activated artifacts
//
// If catalog/model work fails AFTER the canonical CSV succeeds,
// the approved DA week stays committed. Do NOT re-apply that week.
// ============================================================

router.post(
  "/apply-update",

  requireAuth,

  requireAdmin,

  async (req, res) => {
    if (priceApplyInProgress) {
      return res.status(409).json({
        success: false,

        message: "Another price Apply Update is already in progress.",
      });
    }

    priceApplyInProgress = true;

    let writeResult = null;

    let postApplyResult = {
      catalogRegenerated: false,

      modelRetrained: false,

      catalog: null,

      models: null,
    };

    try {
      const canonicalData = loadCanonicalCsv();

      const catalogData = loadCurrentCatalogCsv();

      const prepared = prepareApplyUpdate(req.body, canonicalData, catalogData);

      const dryRun = toBoolean(req.body?.dryRun);

      // ======================================================
      // DRY RUN
      // ======================================================

      if (dryRun) {
        return res.json({
          success: true,

          dryRun: true,

          message:
            "Dry run passed. The request is valid and no files were changed.",

          report: prepared.reportInfo,

          latestExistingWeek: prepared.latestExistingWeek,

          summary: prepared.summary,

          backupCreated: false,

          csvChanged: false,

          catalogRegenerated: false,

          modelRetrained: false,
        });
      }

      // ======================================================
      // PREFLIGHT BEFORE TOUCHING CANONICAL DATA
      // ======================================================

      validatePostApplyPipelineFiles();

      // ======================================================
      // SAFE CANONICAL WRITE
      // ======================================================

      writeResult = safelyWriteCanonicalCsv(
        canonicalData,
        prepared.preparedRecords,
      );

      console.log("DA price update applied successfully.");

      console.log(
        "Week:",
        prepared.reportInfo.weekStart,
        "to",
        prepared.reportInfo.weekEnd,
      );

      console.log("Records appended:", prepared.summary.totalRecords);

      console.log("Canonical backup:", writeResult.backupPath);

      // ======================================================
      // AUTOMATIC CATALOG + MODEL UPDATE
      // ======================================================

      try {
        postApplyResult = await runAutomaticPostApplyPipeline();
      } catch (pipelineError) {
        console.error(
          "Automatic post-apply price pipeline failed:",
          pipelineError.message,
        );

        return res.status(500).json({
          success: false,

          dryRun: false,

          message:
            "The approved DA weekly price records were saved successfully, but the automatic catalog/model update did not fully complete.",

          error: pipelineError.message,

          report: prepared.reportInfo,

          latestExistingWeekBeforeApply: prepared.latestExistingWeek,

          summary: prepared.summary,

          backupCreated: true,

          backupFile: path.basename(writeResult.backupPath),

          finalRowCount: writeResult.finalRowCount,

          csvChanged: true,

          catalogRegenerated: postApplyResult.catalogRegenerated,

          modelRetrained: postApplyResult.modelRetrained,

          recovery:
            "Do not re-apply the same DA week. The canonical DA records are already committed. Fix the reported catalog/model issue and rerun the post-apply scripts. The safe model trainer preserves the previous working live models if retraining fails.",

          currentReportMarkerUpdated: false,
        });
      }

      // ======================================================
      // COMPLETE SUCCESS
      // ======================================================

      return res.json({
        success: true,

        dryRun: false,

        message:
          "Approved DA weekly price records were saved, the current catalog was regenerated, and the regression models were retrained successfully.",

        report: prepared.reportInfo,

        latestExistingWeekBeforeApply: prepared.latestExistingWeek,

        summary: prepared.summary,

        backupCreated: true,

        backupFile: path.basename(writeResult.backupPath),

        finalRowCount: writeResult.finalRowCount,

        csvChanged: true,

        catalogRegenerated: postApplyResult.catalogRegenerated,

        catalogRowCount: postApplyResult.catalog?.rowCount ?? null,

        modelRetrained: postApplyResult.modelRetrained,

        modelArtifacts: postApplyResult.models,

        currentReportMarkerUpdated: false,
      });
    } catch (error) {
      const statusCode =
        error instanceof ApplyUpdateError ? error.statusCode : 500;

      console.error("DA apply update failed:", error.message);

      return res.status(statusCode).json({
        success: false,

        message:
          error instanceof ApplyUpdateError
            ? error.message
            : "Could not safely apply the DA weekly price update.",

        error:
          error instanceof ApplyUpdateError && statusCode < 500
            ? undefined
            : error.message,

        details:
          error instanceof ApplyUpdateError && error.details
            ? error.details
            : undefined,

        csvChanged: Boolean(writeResult),

        backupCreated: Boolean(writeResult),

        backupFile: writeResult
          ? path.basename(writeResult.backupPath)
          : undefined,

        finalRowCount: writeResult ? writeResult.finalRowCount : undefined,

        catalogRegenerated: postApplyResult.catalogRegenerated,

        modelRetrained: postApplyResult.modelRetrained,

        currentReportMarkerUpdated: false,
      });
    } finally {
      priceApplyInProgress = false;
    }
  },
);

module.exports = router;
