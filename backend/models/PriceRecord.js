const mongoose = require("mongoose");

const priceRecordSchema = new mongoose.Schema(
  {
    weekStart: {
      type: Date,
      required: true,
    },

    weekEnd: {
      type: Date,
      default: null,
    },

    year: {
      type: Number,
      required: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    commodity: {
      type: String,
      required: true,
      trim: true,
    },

    specification: {
      type: String,
      default: "(no specification)",
      trim: true,
    },

    unit: {
      type: String,
      required: true,
      trim: true,
    },

    weeklyAveragePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    seriesKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    sourceFile: {
      type: String,
      default: null,
    },

    dataQualityFlag: {
      type: String,
      default: null,
    },

    sourceReadability: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Prevent the same series/week from being inserted twice.
priceRecordSchema.index(
  {
    seriesKey: 1,
    weekStart: 1,
  },
  {
    unique: true,
  },
);

// Useful for history queries.
priceRecordSchema.index({
  commodity: 1,
  weekStart: 1,
});

module.exports = mongoose.model("PriceRecord", priceRecordSchema);
