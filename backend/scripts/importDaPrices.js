const mongoose = require("mongoose");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const PriceRecord = require("../models/PriceRecord");

dotenv.config();

const PROJECT_ROOT = path.join(__dirname, "..", "..");

const CSV_PATH = path.join(
  PROJECT_ROOT,
  "price_data",
  "da_weekly_model_final.csv",
);

// ============================================================
// READ CSV
// ============================================================

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];

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
      .on("error", reject);
  });
}

// ============================================================
// IMPORT DA PRICES
// ============================================================

async function importPrices() {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.ATLAS_URI);

    console.log("MongoDB connected!");

    console.log(`Reading:\n${CSV_PATH}`);

    const rows = await readCSV(CSV_PATH);

    console.log(`CSV rows found: ${rows.length}`);

    const operations = [];

    let skipped = 0;

    // ========================================================
    // PREPARE BULK OPERATIONS
    // ========================================================

    for (const row of rows) {
      const price = Number(row.weekly_average_price);

      const weekStart = new Date(row.week_start);

      if (
        !row.series_key ||
        Number.isNaN(price) ||
        price <= 0 ||
        Number.isNaN(weekStart.getTime())
      ) {
        skipped++;
        continue;
      }

      let weekEnd = null;

      if (row.week_end) {
        const parsedWeekEnd = new Date(row.week_end);

        if (!Number.isNaN(parsedWeekEnd.getTime())) {
          weekEnd = parsedWeekEnd;
        }
      }

      const document = {
        weekStart,

        weekEnd,

        year: Number(row.year) || weekStart.getFullYear(),

        category: row.category_normalized || row.category || "",

        commodity: row.commodity_normalized || row.commodity || "",

        specification:
          row.specification_normalized ||
          row.specification ||
          "(no specification)",

        unit: row.unit,

        weeklyAveragePrice: price,

        seriesKey: row.series_key,

        sourceFile: row.source_file || null,

        dataQualityFlag: row.data_quality_flag || null,

        sourceReadability: row.source_readability || null,
      };

      operations.push({
        updateOne: {
          filter: {
            seriesKey: document.seriesKey,

            weekStart: document.weekStart,
          },

          update: {
            $set: document,
          },

          upsert: true,
        },
      });
    }

    console.log(`Valid records prepared: ${operations.length}`);

    console.log(`Skipped records: ${skipped}`);

    // ========================================================
    // INSERT IN BATCHES
    // ========================================================

    const BATCH_SIZE = 1000;

    let totalInserted = 0;
    let totalModified = 0;
    let totalMatched = 0;

    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, i + BATCH_SIZE);

      const result = await PriceRecord.bulkWrite(batch, {
        ordered: false,
      });

      totalInserted += result.upsertedCount || 0;

      totalModified += result.modifiedCount || 0;

      totalMatched += result.matchedCount || 0;

      const processed = Math.min(i + BATCH_SIZE, operations.length);

      console.log(`Processed ${processed}/${operations.length}`);
    }

    // ========================================================
    // VERIFY DATABASE COUNT
    // ========================================================

    const databaseCount = await PriceRecord.countDocuments();

    console.log();

    console.log("=".repeat(60));

    console.log("DA PRICE IMPORT COMPLETE");

    console.log("=".repeat(60));

    console.log(`Inserted : ${totalInserted}`);

    console.log(`Updated  : ${totalModified}`);

    console.log(`Matched  : ${totalMatched}`);

    console.log(`Skipped  : ${skipped}`);

    console.log(`CSV rows : ${rows.length}`);

    console.log(`Database records: ${databaseCount}`);
  } catch (error) {
    console.error("Import failed:", error);
  } finally {
    await mongoose.disconnect();

    console.log("MongoDB disconnected.");
  }
}

importPrices();
