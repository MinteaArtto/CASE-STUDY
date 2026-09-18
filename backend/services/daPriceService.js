const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

// ============================================================
// PROJECT ROOT
// ============================================================

const projectRoot = path.join(__dirname, "..", "..");

// ============================================================
// DA PRICE MONITORING PAGE
// ============================================================

const DA_PRICE_MONITORING_URL = "https://www.da.gov.ph/price-monitoring/";

// ============================================================
// CANONICAL PRICE DATASET
// ============================================================

const canonicalPriceCsvPath = path.join(
  projectRoot,
  "price_data",
  "da_weekly_model_final.csv",
);

// ============================================================
// DATE FORMATTING
// ============================================================

function formatDateRange(weekStart, weekEnd) {
  const start = new Date(`${weekStart}T00:00:00Z`);

  const end = new Date(`${weekEnd}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${weekStart} to ${weekEnd}`;
  }

  const startMonth = start.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  const endMonth = end.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  const startDay = start.getUTCDate();

  const endDay = end.getUTCDate();

  const startYear = start.getUTCFullYear();

  const endYear = end.getUTCFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${endYear}`;
  }

  if (startYear === endYear) {
    return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${endYear}`;
  }

  return `${startMonth} ${startDay}, ${startYear}-${endMonth} ${endDay}, ${endYear}`;
}

// ============================================================
// GET CURRENT SYSTEM REPORT FROM CANONICAL CSV
// ============================================================

function getCurrentSystemReport() {
  if (!fs.existsSync(canonicalPriceCsvPath)) {
    throw new Error(
      `Canonical price CSV was not found at ${canonicalPriceCsvPath}`,
    );
  }

  const csvText = fs.readFileSync(canonicalPriceCsvPath, "utf8");

  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    throw new Error("The canonical price CSV does not contain any data rows.");
  }

  const headers = lines[0].replace(/^\uFEFF/, "").split(",");

  const weekStartIndex = headers.indexOf("week_start");

  const weekEndIndex = headers.indexOf("week_end");

  if (weekStartIndex === -1 || weekEndIndex === -1) {
    throw new Error(
      "The canonical price CSV is missing week_start or week_end.",
    );
  }

  let latestWeekStart = "";
  let latestWeekEnd = "";

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);

    const weekStart = values[weekStartIndex]?.trim();

    const weekEnd = values[weekEndIndex]?.trim();

    if (!weekStart) {
      continue;
    }

    if (!latestWeekStart || weekStart > latestWeekStart) {
      latestWeekStart = weekStart;

      latestWeekEnd = weekEnd;
    }
  }

  if (!latestWeekStart) {
    throw new Error(
      "Could not determine the latest applied DA week from the canonical CSV.",
    );
  }

  return {
    weekStart: latestWeekStart,

    weekEnd: latestWeekEnd,

    title: formatDateRange(latestWeekStart, latestWeekEnd),
  };
}

// ============================================================
// SIMPLE CSV LINE PARSER
//
// Needed because commodity/specification fields can contain commas.
// ============================================================

function parseCsvLine(line) {
  const values = [];

  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);

      current = "";

      continue;
    }

    current += char;
  }

  values.push(current);

  return values;
}

// ============================================================
// FIND LATEST WEEKLY AVERAGE RETAIL PRICE PDF
// ============================================================

async function getLatestWeeklyPriceReport() {
  const response = await axios.get(DA_PRICE_MONITORING_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },

    timeout: 15000,
  });

  const html = response.data;

  const $ = cheerio.load(html);

  const reports = [];

  $("a").each((index, element) => {
    const text = $(element).text().trim();

    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    const normalizedText = text.toLowerCase();

    const normalizedHref = href.toLowerCase();

    const looksLikeWeeklyReport =
      normalizedText.includes("weekly average") ||
      normalizedHref.includes("weekly-average");

    const isPdf = normalizedHref.includes(".pdf");

    if (looksLikeWeeklyReport && isPdf) {
      reports.push({
        title: text,
        url: href,
      });
    }
  });

  if (reports.length === 0) {
    throw new Error("No weekly DA price report PDF was found.");
  }

  return reports[0];
}

// ============================================================
// NORMALIZE REPORT TITLE
// ============================================================

function normalizeReportTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

// ============================================================
// CHECK WHETHER A NEW REPORT IS AVAILABLE
// ============================================================

async function checkForPriceUpdate() {
  const latestReport = await getLatestWeeklyPriceReport();

  const currentReport = getCurrentSystemReport();

  const updateAvailable =
    normalizeReportTitle(latestReport.title) !==
    normalizeReportTitle(currentReport.title);

  return {
    currentReport: currentReport.title,

    currentReportWeekStart: currentReport.weekStart,

    currentReportWeekEnd: currentReport.weekEnd,

    latestReport: latestReport.title,

    latestReportUrl: latestReport.url,

    updateAvailable,
  };
}

module.exports = {
  getLatestWeeklyPriceReport,
  checkForPriceUpdate,
  getCurrentSystemReport,
};
