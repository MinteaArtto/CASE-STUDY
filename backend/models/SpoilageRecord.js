const mongoose = require("mongoose");

const spoilageRecordSchema = new mongoose.Schema(
  {
    // ========================================================
    // USER WHO PERFORMED THE CLASSIFICATION
    // ========================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ========================================================
    // ORIGINAL IMAGE INFORMATION
    // ========================================================

    originalFilename: {
      type: String,
      required: true,
      trim: true,
    },

    imageUrl: {
      type: String,
      required: true,
    },

    imagePublicId: {
      type: String,
      required: true,
    },

    // ========================================================
    // CLASSIFICATION STATUS
    // ========================================================

    status: {
      type: String,
      enum: ["classified", "rejected_non_produce", "unfamiliar_produce"],
      required: true,
    },

    // ========================================================
    // FINAL FRESH / ROTTEN CLASSIFICATION
    // ========================================================

    prediction: {
      type: String,
      enum: ["Fresh", "Rotten", "Uncertain"],
      default: null,
    },

    // ========================================================
    // DECISION TREE PROBABILITY
    //
    // We intentionally call this treeProbability instead of
    // "confidence" because the value is not being presented
    // as a calibrated confidence score.
    // ========================================================

    treeProbability: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },

    // ========================================================
    // DECISION TREE CLASS PROBABILITIES
    // ========================================================

    classProbabilities: {
      fresh: {
        type: Number,
        default: null,
      },

      rotten: {
        type: Number,
        default: null,
      },
    },

    // ========================================================
    // PRODUCE VALIDATION
    //
    // Stores the CLIP produce-validation information.
    // Mixed is used here because your Python result may
    // contain several validation values.
    // ========================================================

    produceValidation: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ========================================================
    // NOVELTY / OOD RESULT
    //
    // Stores the KNN novelty information.
    // ========================================================

    novelty: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ========================================================
    // NYCKEL VISIBLE SPOILAGE INDICATOR
    //
    // Only populated when Decision Tree predicts Rotten.
    // ========================================================

    spoilageType: {
      type: String,
      default: null,
      trim: true,
    },

    spoilageConfidence: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },

    // ========================================================
    // DECISION SUPPORT
    // ========================================================

    recommendation: {
      type: String,
      default: null,
      trim: true,
    },

    // ========================================================
    // OPTIONAL MESSAGE FROM ML PIPELINE
    // ========================================================

    message: {
      type: String,
      default: null,
      trim: true,
    },
  },

  {
    timestamps: true,
  },
);

// ============================================================
// INDEX
//
// Makes it efficient to retrieve one user's newest
// classifications first.
// ============================================================

spoilageRecordSchema.index({
  user: 1,
  createdAt: -1,
});

module.exports = mongoose.model("SpoilageRecord", spoilageRecordSchema);
