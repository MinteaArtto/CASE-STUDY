import React, { useState } from "react";

import Header from "../components/Header";
import Footer from "../components/Footer";

export default function AdminPriceUpdate() {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // ==========================================================
  // LOADING STATES
  // ==========================================================

  const [loading, setLoading] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);

  const [validationLoading, setValidationLoading] = useState(false);

  const [applyLoading, setApplyLoading] = useState(false);

  // ==========================================================
  // DATA STATES
  // ==========================================================

  const [updateInfo, setUpdateInfo] = useState(null);

  const [previewData, setPreviewData] = useState(null);

  const [editableRecords, setEditableRecords] = useState([]);

  const [validationResult, setValidationResult] = useState(null);

  const [applyResult, setApplyResult] = useState(null);

  const [error, setError] = useState("");

  // ==========================================================
  // GET AUTH TOKEN
  // ==========================================================

  const getToken = () => {
    const token = window.localStorage.getItem("mamav_token");

    if (!token) {
      throw new Error("You are not logged in.");
    }

    return token;
  };

  // ==========================================================
  // CLEAR VALIDATION
  //
  // Any edit after validation means the records must be
  // validated again before they can be applied.
  // ==========================================================

  const clearValidation = () => {
    setValidationResult(null);
    setApplyResult(null);
  };

  // ==========================================================
  // CHECK FOR LATEST DA REPORT
  // ==========================================================

  const handleCheckForUpdates = async () => {
    setLoading(true);

    setError("");

    setPreviewData(null);

    setEditableRecords([]);

    setValidationResult(null);

    setApplyResult(null);

    try {
      const token = getToken();

      const response = await fetch(
        `${API_BASE}/api/admin/prices/check-update`,
        {
          method: "GET",

          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not check for updates.");
      }

      setUpdateInfo(data);
    } catch (err) {
      console.error("Price update check failed:", err);

      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // PREVIEW LATEST DA REPORT
  // ==========================================================

  const handlePreviewUpdate = async () => {
    setPreviewLoading(true);

    setError("");

    setValidationResult(null);

    setApplyResult(null);

    try {
      const token = getToken();

      const response = await fetch(
        `${API_BASE}/api/admin/prices/preview-update`,
        {
          method: "GET",

          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not preview the update.");
      }

      setPreviewData(data);

      const rows = Array.isArray(data.records)
        ? data.records.map((record, index) => ({
            ...record,

            rowId: `${index}-${record.seriesKey || record.commodity}`,

            reviewed: !record.needsReview,
          }))
        : [];

      setEditableRecords(rows);
    } catch (err) {
      console.error("Price update preview failed:", err);

      setError(err.message || "Something went wrong.");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ==========================================================
  // EDIT PREVIEW ROW
  // ==========================================================

  const handleRecordChange = (index, field, value) => {
    clearValidation();

    setEditableRecords((currentRecords) => {
      const updated = [...currentRecords];

      updated[index] = {
        ...updated[index],

        [field]: value,
      };

      return updated;
    });
  };

  // ==========================================================
  // REVIEW CHECKBOX
  // ==========================================================

  const handleReviewedChange = (index, checked) => {
    clearValidation();

    setEditableRecords((currentRecords) => {
      const updated = [...currentRecords];

      updated[index] = {
        ...updated[index],

        reviewed: checked,
      };

      return updated;
    });
  };

  // ==========================================================
  // RESET PREVIEW EDITS
  // ==========================================================

  const handleResetPreview = () => {
    if (!previewData?.records) {
      return;
    }

    const rows = previewData.records.map((record, index) => ({
      ...record,

      rowId: `${index}-${record.seriesKey || record.commodity}`,

      reviewed: !record.needsReview,
    }));

    setEditableRecords(rows);

    setValidationResult(null);

    setApplyResult(null);

    setError("");
  };

  // ==========================================================
  // FORMAT PRICE
  // ==========================================================

  const formatPrice = (value) => {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      Number.isNaN(Number(value))
    ) {
      return "—";
    }

    return new Intl.NumberFormat("en-PH", {
      style: "currency",

      currency: "PHP",

      minimumFractionDigits: 2,

      maximumFractionDigits: 2,
    }).format(Number(value));
  };

  // ==========================================================
  // COUNTS
  // ==========================================================

  const newCount = editableRecords.filter(
    (record) => record.isNewCommodity || record.catalogStatus === "new",
  ).length;

  const reviewCount = editableRecords.filter(
    (record) => record.needsReview,
  ).length;

  const unreviewedCount = editableRecords.filter(
    (record) => record.needsReview && !record.reviewed,
  ).length;

  // ==========================================================
  // GET REPORT FILENAME
  // ==========================================================

  const getPreviewFilename = () => {
    return (
      previewData?.report?.filename || previewData?.latestReport?.filename || ""
    );
  };

  // ==========================================================
  // BUILD APPLY PAYLOAD
  //
  // Same exact records are used by:
  //
  // 1. Validate Update
  // 2. Apply Update
  //
  // The only difference is dryRun true/false.
  // ==========================================================

  const buildApplyPayload = (dryRun) => {
    if (!previewData) {
      throw new Error("There is no preview available.");
    }

    if (editableRecords.length === 0) {
      throw new Error("There are no price records available.");
    }

    if (unreviewedCount > 0) {
      throw new Error(
        `${unreviewedCount} OCR row${
          unreviewedCount === 1 ? "" : "s"
        } still need manual review.`,
      );
    }

    const report = previewData.report;

    if (!report?.weekStart || !report?.weekEnd) {
      throw new Error("The preview does not contain a valid reporting week.");
    }

    const filename = getPreviewFilename();

    if (!filename) {
      throw new Error("The DA report filename is missing.");
    }

    const records = editableRecords.map((record) => ({
      weekStart: record.weekStart,

      weekEnd: record.weekEnd,

      category: record.category,

      commodity: record.commodity,

      specification: record.specification,

      unit: record.unit,

      weeklyAveragePrice:
        record.weeklyAveragePrice === "" ||
        record.weeklyAveragePrice === null ||
        record.weeklyAveragePrice === undefined
          ? null
          : record.weeklyAveragePrice,

      catalogStatus: record.catalogStatus,

      seriesKey: record.seriesKey,

      extractionMethod: record.extractionMethod,

      needsReview: Boolean(record.needsReview),

      reviewed: Boolean(record.reviewed),
    }));

    return {
      dryRun,

      report: {
        weekStart: report.weekStart,

        weekEnd: report.weekEnd,

        filename,
      },

      records,
    };
  };

  // ==========================================================
  // VALIDATE UPDATE
  //
  // dryRun: true
  //
  // No file changes.
  // No backup.
  // ==========================================================

  const handleValidateUpdate = async () => {
    setValidationLoading(true);

    setError("");

    setValidationResult(null);

    setApplyResult(null);

    try {
      const token = getToken();

      const payload = buildApplyPayload(true);

      const response = await fetch(
        `${API_BASE}/api/admin/prices/apply-update`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Price update validation failed.");
      }

      if (
        data.success !== true ||
        data.dryRun !== true ||
        data.csvChanged !== false
      ) {
        throw new Error(
          "The backend returned an unexpected validation result.",
        );
      }

      setValidationResult(data);
    } catch (err) {
      console.error("Price update validation failed:", err);

      setError(err.message || "Could not validate the price update.");
    } finally {
      setValidationLoading(false);
    }
  };

  // ==========================================================
  // APPLY UPDATE
  //
  // dryRun: false
  //
  // This performs the real canonical CSV update, regenerates
  // the current catalog / forecast eligibility data, and retrains
  // the price forecasting models automatically.
  // ==========================================================

  const handleApplyUpdate = async () => {
    if (!validationResult?.success || validationResult?.dryRun !== true) {
      setError("Validate the update successfully before applying it.");

      return;
    }

    // --------------------------------------------------------
    // FINAL ADMIN CONFIRMATION
    // --------------------------------------------------------

    const confirmed = window.confirm(
      [
        "Apply this DA weekly price update?",
        "",
        `Report: ${previewData?.report?.weekStart || ""} to ${
          previewData?.report?.weekEnd || ""
        }`,
        "",
        `Records: ${editableRecords.length}`,
        `Unavailable prices: ${
          validationResult?.summary?.unavailablePriceRecords ?? 0
        }`,
        "",
        "A backup of the canonical CSV will be created before the update.",
        "",
        "Continue?",
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    setApplyLoading(true);

    setError("");

    setApplyResult(null);

    try {
      const token = getToken();

      const payload = buildApplyPayload(false);

      const response = await fetch(
        `${API_BASE}/api/admin/prices/apply-update`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not apply the price update.");
      }

      if (
        data.success !== true ||
        data.dryRun !== false ||
        data.csvChanged !== true
      ) {
        throw new Error(
          "The backend returned an unexpected Apply Update result.",
        );
      }

      setApplyResult(data);
    } catch (err) {
      console.error("Apply Update failed:", err);

      setError(err.message || "Could not apply the price update.");
    } finally {
      setApplyLoading(false);
    }
  };

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, var(--color-cream) 0%, var(--color-cream-light) 100%)",
      }}
      className="
        min-h-screen
        text-ink
        font-sans
        flex
        flex-col
      "
    >
      <Header />

      <main
        className="
          max-w-7xl
          w-full
          mx-auto
          px-4
          sm:px-6

          py-8
          sm:py-10
          lg:py-16

          flex-1
        "
      >
        {/* ====================================================
            PAGE TITLE
            ==================================================== */}

        <section className="text-center">
          <p
            className="
              text-sm
              text-green-700
              font-medium
            "
          >
            Administration
          </p>

          <h1
            className="
              mt-4
              text-3xl
              sm:text-4xl
              font-display
              font-bold
              text-ink
            "
          >
            Price Data Update
          </h1>

          <p
            className="
              mt-3
              text-ink/70
              max-w-2xl
              mx-auto
            "
          >
            Check and validate the latest Department of Agriculture Weekly
            Average Retail Prices report before updating the system.
          </p>
        </section>

        {/* ====================================================
            REPORT CHECK
            ==================================================== */}

        <section
          className="
            mt-8
            sm:mt-10
            lg:mt-12

            max-w-6xl
            mx-auto
            bg-white/80
            rounded-2xl
            border
            border-ink/10
            shadow-sm
            p-4
            sm:p-6
            md:p-8
          "
        >
          <div
            className="
              flex
              flex-col
              sm:flex-row
              sm:items-center
              sm:justify-between
              gap-4
              sm:gap-5
            "
          >
            <div>
              <h2
                className="
                  text-xl
                  font-display
                  font-bold
                  text-ink
                "
              >
                DA Weekly Price Report
              </h2>

              <p
                className="
                  mt-2
                  text-sm
                  text-ink/60
                  max-w-xl
                "
              >
                Compare the report currently used by the system with the latest
                weekly report published by the Department of Agriculture.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCheckForUpdates}
              disabled={
                loading || previewLoading || validationLoading || applyLoading
              }
              style={{
                backgroundColor: "#111111",

                color: "#ffffff",
              }}
              className="
                w-full
                sm:w-auto
                shrink-0

                px-6
                py-3
                rounded-full
                text-sm
                font-medium
                hover:opacity-80
                disabled:opacity-50
                disabled:cursor-not-allowed
                transition-opacity
              "
            >
              {loading ? "Checking..." : "Check for Updates"}
            </button>
          </div>

          {/* ERROR */}

          {error && (
            <div
              className="
                mt-6
                rounded-xl
                border
                border-red-300
                bg-red-100
                px-5
                py-4
                text-sm
                text-red-700
              "
            >
              {error}
            </div>
          )}

          {/* INITIAL STATE */}

          {!updateInfo && !error && (
            <div
              className="
                mt-8
                rounded-2xl
                border
                border-dashed
                border-ink/15
                px-4
                sm:px-6

                py-8
                sm:py-12
                text-center
              "
            >
              <div
                className="
                  text-3xl
                  mb-3
                "
              >
                ↻
              </div>

              <h3
                className="
                  font-display
                  font-semibold
                  text-ink
                "
              >
                No update check yet
              </h3>

              <p
                className="
                  mt-2
                  text-sm
                  text-ink/60
                "
              >
                Click Check for Updates to check the latest DA weekly report.
              </p>
            </div>
          )}

          {/* UPDATE INFO */}

          {updateInfo && (
            <div className="mt-8">
              <div
                className="
                  grid
                  grid-cols-1
                  sm:grid-cols-2
                  gap-4
                "
              >
                <div
                  className="
                    rounded-2xl
                    bg-cream
                    border
                    border-ink/10
                    p-5
                  "
                >
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-ink/50
                    "
                  >
                    Current System Report
                  </p>

                  <p
                    className="
                      mt-2
                      font-display
                      font-semibold
                    "
                  >
                    {updateInfo.currentReport}
                  </p>
                </div>

                <div
                  className="
                    rounded-2xl
                    bg-cream
                    border
                    border-ink/10
                    p-5
                  "
                >
                  <p
                    className="
                      text-xs
                      uppercase
                      tracking-wide
                      text-ink/50
                    "
                  >
                    Latest DA Report
                  </p>

                  <p
                    className="
                      mt-2
                      font-display
                      font-semibold
                    "
                  >
                    {updateInfo.latestReport}
                  </p>
                </div>
              </div>

              <div
                className={`
                  mt-6
                  rounded-2xl
                  border
                  p-5

                  ${
                    updateInfo.updateAvailable
                      ? `
                        bg-amber-100/70
                        border-amber-400/60
                      `
                      : `
                        bg-green-100/70
                        border-green-400/60
                      `
                  }
                `}
              >
                <h3
                  className="
                    font-display
                    font-semibold
                  "
                >
                  {updateInfo.updateAvailable
                    ? "New price report available"
                    : "Price data is up to date"}
                </h3>

                <p
                  className="
                    mt-2
                    text-sm
                    text-ink/70
                  "
                >
                  {updateInfo.updateAvailable
                    ? "A newer DA weekly price report is available. Preview and validate it before applying any changes."
                    : "The system is currently using the latest DA weekly price report."}
                </p>
              </div>

              <div
                className="
                  mt-6

                  grid
                  grid-cols-1
                  sm:flex
                  sm:flex-wrap

                  gap-3
                "
              >
                {updateInfo.latestReportUrl && (
                  <a
                    href={updateInfo.latestReportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      border
                      border-ink/20
                      bg-white/60
                      text-ink
                      w-full
                      sm:w-auto

                      px-5
                      py-2.5
                      rounded-full
                      text-sm
                      font-medium
                    "
                  >
                    View DA Report
                  </a>
                )}

                {updateInfo.updateAvailable && (
                  <button
                    type="button"
                    onClick={handlePreviewUpdate}
                    disabled={
                      previewLoading ||
                      loading ||
                      validationLoading ||
                      applyLoading
                    }
                    className="
                      bg-teal
                      text-ink
                      w-full
                      sm:w-auto

                      px-5
                      py-2.5
                      rounded-full
                      text-sm
                      font-medium
                      hover:opacity-80
                      disabled:opacity-50
                      disabled:cursor-not-allowed
                    "
                  >
                    {previewLoading ? "Preparing Preview..." : "Preview Update"}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ====================================================
            EDITABLE PREVIEW
            ==================================================== */}

        {previewData && (
          <section
            className="
              mt-6
              sm:mt-8

              max-w-6xl
              mx-auto
              bg-white/80
              rounded-2xl
              border
              border-ink/10
              shadow-sm
              p-4
              sm:p-6
              md:p-8
            "
          >
            {/* HEADER */}

            <div
              className="
                flex
                flex-col
                sm:flex-row
                sm:items-start
                sm:justify-between
                gap-4
                sm:gap-5
              "
            >
              <div>
                <p
                  className="
                    text-sm
                    text-green-700
                    font-medium
                  "
                >
                  Validation Preview
                </p>

                <h2
                  className="
                    mt-2
                    text-2xl
                    font-display
                    font-bold
                  "
                >
                  Review Extracted Prices
                </h2>

                <p
                  className="
                    mt-2
                    text-sm
                    text-ink/60
                    max-w-2xl
                  "
                >
                  Review and correct the extracted values. Validate them first
                  before the real update can be applied.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetPreview}
                disabled={validationLoading || applyLoading}
                className="
                  w-full
                  sm:w-auto

                  border
                  border-ink/20
                  bg-white
                  px-4
                  py-2
                  rounded-full
                  text-sm
                  font-medium
                  hover:bg-cream
                  disabled:opacity-50
                  disabled:cursor-not-allowed
                "
              >
                Reset Edits
              </button>
            </div>

            {/* ==================================================
                SUMMARY
                ================================================== */}

            <div
              className="
                mt-7
                grid
                grid-cols-2
                sm:grid-cols-3
                lg:grid-cols-5
                gap-3
              "
            >
              <SummaryCard label="Rows" value={editableRecords.length} />

              <SummaryCard
                label="Method"
                value={previewData.extraction?.method || "—"}
              />

              <SummaryCard label="New" value={newCount} />

              <SummaryCard label="Needs Review" value={reviewCount} />

              <SummaryCard label="Unreviewed" value={unreviewedCount} />
            </div>

            {/* OCR WARNING */}

            {previewData.extraction?.documentNeedsReview && (
              <div
                className="
                  mt-6
                  rounded-xl
                  border
                  border-amber-400
                  bg-amber-50
                  px-5
                  py-4
                "
              >
                <p
                  className="
                    font-semibold
                    text-ink
                  "
                >
                  OCR validation required
                </p>

                <p
                  className="
                    mt-1
                    text-sm
                    text-ink/70
                  "
                >
                  This report was read using OCR. Review and correct each
                  extracted row before validating the update.
                </p>
              </div>
            )}

            {/* ==================================================
                MOBILE + TABLET EDITABLE RECORDS
                ================================================== */}

            <div
              className="
                lg:hidden

                mt-7

                space-y-4
              "
            >
              {editableRecords.map((record, index) => {
                const inputsDisabled =
                  validationLoading ||
                  applyLoading ||
                  Boolean(applyResult?.success);

                return (
                  <article
                    key={record.rowId}
                    className={`
                      rounded-2xl

                      border

                      p-4
                      sm:p-5

                      ${
                        record.needsReview && !record.reviewed
                          ? "border-amber-300 bg-amber-50/70"
                          : "border-ink/10 bg-white/80"
                      }
                    `}
                  >
                    <div
                      className="
                        flex
                        items-start
                        justify-between
                        gap-3
                      "
                    >
                      <div>
                        <p
                          className="
                            text-xs
                            uppercase
                            tracking-wide
                            text-ink/45
                          "
                        >
                          Row {index + 1}
                        </p>

                        <h3
                          className="
                            mt-1

                            font-display
                            font-bold

                            text-base
                            sm:text-lg
                          "
                        >
                          {record.commodity || "Unnamed commodity"}
                        </h3>

                        {record.isNewCommodity && (
                          <p
                            className="
                              mt-1

                              text-xs
                              font-medium
                              text-amber-700
                            "
                          >
                            New catalog item
                          </p>
                        )}
                      </div>

                      <div
                        className="
                          flex
                          flex-col
                          items-end
                          gap-2

                          shrink-0
                        "
                      >
                        <span
                          className={`
                            inline-flex

                            rounded-full

                            px-2.5
                            py-1

                            text-[10px]
                            font-semibold

                            ${
                              record.catalogStatus === "new"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-green-100 text-green-800"
                            }
                          `}
                        >
                          {record.catalogStatus === "new" ? "New" : "Existing"}
                        </span>

                        <span
                          className={`
                            inline-flex

                            rounded-full

                            px-2.5
                            py-1

                            text-[10px]
                            font-semibold

                            ${
                              record.extractionMethod === "ocr"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-blue-100 text-blue-800"
                            }
                          `}
                        >
                          {record.extractionMethod || "—"}
                        </span>
                      </div>
                    </div>

                    <div
                      className="
                        mt-4

                        grid
                        grid-cols-1
                        sm:grid-cols-2

                        gap-3
                      "
                    >
                      <label className="block">
                        <span className="text-xs text-ink/50">Category</span>

                        <input
                          type="text"
                          value={record.category || ""}
                          disabled={inputsDisabled}
                          onChange={(event) =>
                            handleRecordChange(
                              index,
                              "category",
                              event.target.value,
                            )
                          }
                          className="
                            mt-1.5

                            w-full
                            min-w-0

                            rounded-lg

                            border
                            border-ink/15

                            bg-white

                            px-3
                            py-2.5

                            text-sm

                            outline-none

                            focus:border-teal

                            disabled:opacity-60
                          "
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs text-ink/50">Commodity</span>

                        <input
                          type="text"
                          value={record.commodity || ""}
                          disabled={inputsDisabled}
                          onChange={(event) =>
                            handleRecordChange(
                              index,
                              "commodity",
                              event.target.value,
                            )
                          }
                          className="
                            mt-1.5

                            w-full
                            min-w-0

                            rounded-lg

                            border
                            border-ink/15

                            bg-white

                            px-3
                            py-2.5

                            text-sm

                            outline-none

                            focus:border-teal

                            disabled:opacity-60
                          "
                        />
                      </label>

                      <label
                        className="
                          block
                          sm:col-span-2
                        "
                      >
                        <span className="text-xs text-ink/50">
                          Specification
                        </span>

                        <input
                          type="text"
                          value={record.specification || ""}
                          disabled={inputsDisabled}
                          onChange={(event) =>
                            handleRecordChange(
                              index,
                              "specification",
                              event.target.value,
                            )
                          }
                          placeholder="No specification"
                          className="
                            mt-1.5

                            w-full
                            min-w-0

                            rounded-lg

                            border
                            border-ink/15

                            bg-white

                            px-3
                            py-2.5

                            text-sm

                            outline-none

                            focus:border-teal

                            disabled:opacity-60
                          "
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs text-ink/50">Unit</span>

                        <input
                          type="text"
                          value={record.unit || ""}
                          disabled={inputsDisabled}
                          onChange={(event) =>
                            handleRecordChange(
                              index,
                              "unit",
                              event.target.value,
                            )
                          }
                          className="
                            mt-1.5

                            w-full

                            rounded-lg

                            border
                            border-ink/15

                            bg-white

                            px-3
                            py-2.5

                            text-sm

                            outline-none

                            focus:border-teal

                            disabled:opacity-60
                          "
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs text-ink/50">
                          Weekly Average
                        </span>

                        <div
                          className="
                            mt-1.5

                            flex
                            items-center

                            gap-2
                          "
                        >
                          <span className="text-sm">₱</span>

                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={record.weeklyAveragePrice ?? ""}
                            disabled={inputsDisabled}
                            onChange={(event) =>
                              handleRecordChange(
                                index,
                                "weeklyAveragePrice",
                                event.target.value,
                              )
                            }
                            className="
                              w-full
                              min-w-0

                              rounded-lg

                              border
                              border-ink/15

                              bg-white

                              px-3
                              py-2.5

                              text-sm

                              outline-none

                              focus:border-teal

                              disabled:opacity-60
                            "
                          />
                        </div>

                        <span
                          className="
                            mt-1

                            block

                            text-[11px]
                            text-ink/40
                          "
                        >
                          {formatPrice(record.weeklyAveragePrice)}
                        </span>
                      </label>
                    </div>

                    {record.needsReview && (
                      <div
                        className="
                          mt-4

                          rounded-xl

                          border
                          border-amber-200

                          bg-amber-50

                          p-3
                        "
                      >
                        <label
                          className="
                            flex
                            items-start
                            gap-3
                          "
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(record.reviewed)}
                            disabled={inputsDisabled}
                            onChange={(event) =>
                              handleReviewedChange(index, event.target.checked)
                            }
                            className="
                              mt-0.5

                              h-5
                              w-5

                              cursor-pointer

                              disabled:opacity-50
                              disabled:cursor-not-allowed

                              shrink-0
                            "
                          />

                          <span>
                            <span
                              className="
                                block

                                text-sm
                                font-semibold
                                text-amber-800
                              "
                            >
                              Manual validation required
                            </span>

                            <span
                              className="
                                mt-0.5

                                block

                                text-xs
                                leading-5
                                text-amber-800/75
                              "
                            >
                              Confirm that this OCR-extracted row is correct
                              before validating the update.
                            </span>
                          </span>
                        </label>
                      </div>
                    )}

                    {!record.needsReview && (
                      <div
                        className="
                          mt-4

                          inline-flex
                          items-center
                          gap-2

                          text-xs
                          font-medium
                          text-green-700
                        "
                      >
                        <span>✓</span>
                        No manual review required
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {/* ==================================================
                TABLE
                ================================================== */}

            <div
              className="
                hidden
                lg:block

                mt-7
                overflow-x-auto
                rounded-2xl
                border
                border-ink/10
              "
            >
              <table
                className="
                  w-full
                  min-w-[1400px]
                  text-sm
                "
              >
                <thead
                  className="
                    bg-cream
                    border-b
                    border-ink/10
                  "
                >
                  <tr>
                    <th className="px-4 py-4 text-left">#</th>

                    <th className="px-4 py-4 text-left">Category</th>

                    <th className="px-4 py-4 text-left">Commodity</th>

                    <th className="px-4 py-4 text-left">Specification</th>

                    <th className="px-4 py-4 text-left">Unit</th>

                    <th className="px-4 py-4 text-left">Weekly Average</th>

                    <th className="px-4 py-4 text-left">Catalog</th>

                    <th className="px-4 py-4 text-left">Extraction</th>

                    <th className="px-4 py-4 text-center">Reviewed</th>
                  </tr>
                </thead>

                <tbody>
                  {editableRecords.map((record, index) => (
                    <tr
                      key={record.rowId}
                      className={`
                          border-b
                          border-ink/5

                          ${
                            record.needsReview && !record.reviewed
                              ? "bg-amber-50/60"
                              : ""
                          }
                        `}
                    >
                      <td
                        className="
                            px-4
                            py-4
                            text-ink/50
                            align-top
                          "
                      >
                        {index + 1}
                      </td>

                      {/* CATEGORY */}

                      <td className="px-4 py-3 align-top">
                        <input
                          type="text"
                          value={record.category || ""}
                          disabled={
                            validationLoading ||
                            applyLoading ||
                            Boolean(applyResult?.success)
                          }
                          onChange={(event) =>
                            handleRecordChange(
                              index,
                              "category",
                              event.target.value,
                            )
                          }
                          className="
                              w-48
                              rounded-lg
                              border
                              border-ink/15
                              bg-white
                              px-3
                              py-2
                              outline-none
                              focus:border-teal
                              disabled:opacity-60
                            "
                        />
                      </td>

                      {/* COMMODITY */}

                      <td className="px-4 py-3 align-top">
                        <input
                          type="text"
                          value={record.commodity || ""}
                          disabled={
                            validationLoading ||
                            applyLoading ||
                            Boolean(applyResult?.success)
                          }
                          onChange={(event) =>
                            handleRecordChange(
                              index,
                              "commodity",
                              event.target.value,
                            )
                          }
                          className="
                              w-60
                              rounded-lg
                              border
                              border-ink/15
                              bg-white
                              px-3
                              py-2
                              outline-none
                              focus:border-teal
                              disabled:opacity-60
                            "
                        />

                        {record.isNewCommodity && (
                          <p
                            className="
                                mt-1
                                text-xs
                                text-amber-700
                              "
                          >
                            New catalog item
                          </p>
                        )}
                      </td>

                      {/* SPECIFICATION */}

                      <td className="px-4 py-3 align-top">
                        <input
                          type="text"
                          value={record.specification || ""}
                          disabled={
                            validationLoading ||
                            applyLoading ||
                            Boolean(applyResult?.success)
                          }
                          onChange={(event) =>
                            handleRecordChange(
                              index,
                              "specification",
                              event.target.value,
                            )
                          }
                          placeholder="No specification"
                          className="
                              w-64
                              rounded-lg
                              border
                              border-ink/15
                              bg-white
                              px-3
                              py-2
                              outline-none
                              focus:border-teal
                              disabled:opacity-60
                            "
                        />
                      </td>

                      {/* UNIT */}

                      <td className="px-4 py-3 align-top">
                        <input
                          type="text"
                          value={record.unit || ""}
                          disabled={
                            validationLoading ||
                            applyLoading ||
                            Boolean(applyResult?.success)
                          }
                          onChange={(event) =>
                            handleRecordChange(
                              index,
                              "unit",
                              event.target.value,
                            )
                          }
                          className="
                              w-20
                              rounded-lg
                              border
                              border-ink/15
                              bg-white
                              px-3
                              py-2
                              outline-none
                              focus:border-teal
                              disabled:opacity-60
                            "
                        />
                      </td>

                      {/* PRICE */}

                      <td className="px-4 py-3 align-top">
                        <div
                          className="
                              flex
                              items-center
                              gap-2
                            "
                        >
                          <span>₱</span>

                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={record.weeklyAveragePrice ?? ""}
                            disabled={
                              validationLoading ||
                              applyLoading ||
                              Boolean(applyResult?.success)
                            }
                            onChange={(event) =>
                              handleRecordChange(
                                index,
                                "weeklyAveragePrice",
                                event.target.value,
                              )
                            }
                            className="
                                w-28
                                rounded-lg
                                border
                                border-ink/15
                                bg-white
                                px-3
                                py-2
                                outline-none
                                focus:border-teal
                                disabled:opacity-60
                              "
                          />
                        </div>

                        <p
                          className="
                              mt-1
                              text-xs
                              text-ink/40
                            "
                        >
                          {formatPrice(record.weeklyAveragePrice)}
                        </p>
                      </td>

                      {/* CATALOG */}

                      <td className="px-4 py-4 align-top">
                        {record.catalogStatus === "new" ? (
                          <span
                            className="
                                inline-flex
                                rounded-full
                                bg-amber-100
                                text-amber-800
                                px-3
                                py-1
                                text-xs
                                font-semibold
                              "
                          >
                            New
                          </span>
                        ) : (
                          <span
                            className="
                                inline-flex
                                rounded-full
                                bg-green-100
                                text-green-800
                                px-3
                                py-1
                                text-xs
                                font-semibold
                              "
                          >
                            Existing
                          </span>
                        )}
                      </td>

                      {/* EXTRACTION */}

                      <td className="px-4 py-4 align-top">
                        <span
                          className={`
                              inline-flex
                              rounded-full
                              px-3
                              py-1
                              text-xs
                              font-semibold

                              ${
                                record.extractionMethod === "ocr"
                                  ? "bg-orange-100 text-orange-800"
                                  : "bg-blue-100 text-blue-800"
                              }
                            `}
                        >
                          {record.extractionMethod}
                        </span>

                        {record.needsReview && (
                          <p
                            className="
                                mt-2
                                text-xs
                                text-amber-700
                                max-w-40
                              "
                          >
                            Manual validation required
                          </p>
                        )}
                      </td>

                      {/* REVIEWED */}

                      <td
                        className="
                            px-4
                            py-4
                            text-center
                            align-top
                          "
                      >
                        {record.needsReview ? (
                          <input
                            type="checkbox"
                            checked={Boolean(record.reviewed)}
                            disabled={
                              validationLoading ||
                              applyLoading ||
                              Boolean(applyResult?.success)
                            }
                            onChange={(event) =>
                              handleReviewedChange(index, event.target.checked)
                            }
                            className="
                                h-5
                                w-5
                                cursor-pointer
                                disabled:opacity-50
                                disabled:cursor-not-allowed
                              "
                          />
                        ) : (
                          <span
                            className="
                                text-green-700
                                font-semibold
                              "
                          >
                            ✓
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ==================================================
                ACTION AREA
                ================================================== */}

            {!applyResult?.success && (
              <div
                className="
                  mt-6
                  flex
                  flex-col
                  lg:flex-row
                  lg:items-center
                  lg:justify-between
                  gap-4
                "
              >
                <div>
                  {unreviewedCount > 0 ? (
                    <>
                      <p
                        className="
                          font-semibold
                          text-amber-700
                        "
                      >
                        {unreviewedCount} OCR row
                        {unreviewedCount === 1 ? "" : "s"} still need review.
                      </p>

                      <p
                        className="
                          mt-1
                          text-sm
                          text-ink/60
                        "
                      >
                        Review all OCR rows before validation.
                      </p>
                    </>
                  ) : validationResult?.success ? (
                    <>
                      <p
                        className="
                          font-semibold
                          text-green-700
                        "
                      >
                        Validation passed.
                      </p>

                      <p
                        className="
                          mt-1
                          text-sm
                          text-ink/60
                        "
                      >
                        The validated records are ready to be applied.
                      </p>
                    </>
                  ) : (
                    <>
                      <p
                        className="
                          font-semibold
                          text-green-700
                        "
                      >
                        Preview ready for validation.
                      </p>

                      <p
                        className="
                          mt-1
                          text-sm
                          text-ink/60
                        "
                      >
                        You can still edit any value before validating the
                        update.
                      </p>
                    </>
                  )}
                </div>

                <div
                  className="
                    grid
                    grid-cols-1
                    sm:flex
                    sm:flex-wrap

                    gap-3
                  "
                >
                  {/* VALIDATE */}

                  <button
                    type="button"
                    onClick={handleValidateUpdate}
                    disabled={
                      validationLoading ||
                      applyLoading ||
                      editableRecords.length === 0 ||
                      unreviewedCount > 0
                    }
                    className="
                      w-full
                      sm:w-auto

                      px-6
                      py-3
                      rounded-full
                      bg-ink
                      text-white
                      text-sm
                      font-medium
                      hover:opacity-80
                      disabled:opacity-40
                      disabled:cursor-not-allowed
                      transition-opacity
                    "
                  >
                    {validationLoading
                      ? "Validating..."
                      : validationResult?.success
                        ? "Validate Again"
                        : "Validate Update"}
                  </button>

                  {/* REAL APPLY */}

                  {validationResult?.success && (
                    <button
                      type="button"
                      onClick={handleApplyUpdate}
                      disabled={applyLoading || validationLoading}
                      className="
                        w-full
                        sm:w-auto

                        px-6
                        py-3
                        rounded-full
                        bg-green-700
                        text-white
                        text-sm
                        font-semibold
                        hover:opacity-80
                        disabled:opacity-40
                        disabled:cursor-not-allowed
                        transition-opacity
                      "
                    >
                      {applyLoading ? "Applying Update..." : "Apply Update"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ==================================================
                VALIDATION SUCCESS
                ================================================== */}

            {validationResult?.success && !applyResult?.success && (
              <div
                className="
                    mt-6
                    rounded-xl
                    border
                    border-green-300
                    bg-green-50
                    px-5
                    py-4
                  "
              >
                <p
                  className="
                      font-semibold
                      text-green-800
                    "
                >
                  Validation passed
                </p>

                <p
                  className="
                      mt-1
                      text-sm
                      text-green-800/80
                    "
                >
                  All {validationResult.summary?.totalRecords ?? 0} records
                  passed backend validation. No production data was changed.
                </p>

                <div
                  className="
                      mt-4
                      grid
                      grid-cols-2
                      sm:grid-cols-4
                      gap-3
                      text-sm
                    "
                >
                  <ResultItem
                    label="Existing"
                    value={validationResult.summary?.existingRecords ?? 0}
                  />

                  <ResultItem
                    label="New"
                    value={validationResult.summary?.newRecords ?? 0}
                  />

                  <ResultItem
                    label="Reviewed OCR"
                    value={validationResult.summary?.reviewedOcrRecords ?? 0}
                  />

                  <ResultItem
                    label="No Price"
                    value={
                      validationResult.summary?.unavailablePriceRecords ?? 0
                    }
                  />
                </div>

                <p
                  className="
                      mt-3
                      text-xs
                      text-green-700
                    "
                >
                  Dry run only — CSV changed:{" "}
                  {validationResult.csvChanged ? "Yes" : "No"}
                </p>

                <p
                  className="
                      mt-1
                      text-xs
                      text-green-700
                    "
                >
                  Backup created:{" "}
                  {validationResult.backupCreated ? "Yes" : "No"}
                </p>
              </div>
            )}

            {/* ==================================================
                INITIAL SAFE MODE MESSAGE
                ================================================== */}

            {!validationResult && !applyResult?.success && (
              <div
                className="
                    mt-6
                    rounded-xl
                    border
                    border-blue-200
                    bg-blue-50
                    px-5
                    py-4
                  "
              >
                <p
                  className="
                      font-medium
                      text-ink
                    "
                >
                  Step 1: Validate the update
                </p>

                <p
                  className="
                      mt-1
                      text-sm
                      text-ink/70
                    "
                >
                  Validate Update checks all edited rows using the backend
                  safety rules. No production data is changed during validation.
                </p>
              </div>
            )}

            {/* ==================================================
                REAL APPLY SUCCESS
                ================================================== */}

            {applyResult?.success && (
              <div
                className="
                  mt-6
                  rounded-2xl
                  border
                  border-green-400
                  bg-green-50
                  px-4
                  sm:px-6

                  py-5
                  sm:py-6
                "
              >
                <p
                  className="
                    text-lg
                    font-display
                    font-bold
                    text-green-800
                  "
                >
                  Price update applied successfully
                </p>

                <p
                  className="
                    mt-2
                    text-sm
                    text-green-800/80
                  "
                >
                  The approved DA weekly price records were added to the
                  canonical dataset, the current catalog was regenerated, and
                  the price forecasting models were retrained successfully.
                </p>

                <div
                  className="
                    mt-5
                    grid
                    grid-cols-2
                    sm:grid-cols-4
                    gap-4
                  "
                >
                  <SummaryCard
                    label="Records Added"
                    value={applyResult.summary?.totalRecords ?? 0}
                  />

                  <SummaryCard
                    label="Existing"
                    value={applyResult.summary?.existingRecords ?? 0}
                  />

                  <SummaryCard
                    label="New"
                    value={applyResult.summary?.newRecords ?? 0}
                  />

                  <SummaryCard
                    label="No Price"
                    value={applyResult.summary?.unavailablePriceRecords ?? 0}
                  />
                </div>

                <div
                  className="
                    mt-5
                    rounded-xl
                    border
                    border-green-200
                    bg-white/70
                    px-5
                    py-4
                    text-sm
                  "
                >
                  <p>
                    <span className="text-ink/50">CSV changed:</span>{" "}
                    <strong>{applyResult.csvChanged ? "Yes" : "No"}</strong>
                  </p>

                  <p className="mt-1">
                    <span className="text-ink/50">Backup created:</span>{" "}
                    <strong>{applyResult.backupCreated ? "Yes" : "No"}</strong>
                  </p>

                  {applyResult.backupFile && (
                    <p className="mt-1">
                      <span className="text-ink/50">Backup file:</span>{" "}
                      <strong className="break-all">
                        {applyResult.backupFile}
                      </strong>
                    </p>
                  )}

                  {applyResult.finalRowCount !== undefined && (
                    <p className="mt-1">
                      <span className="text-ink/50">Canonical rows:</span>{" "}
                      <strong>{applyResult.finalRowCount}</strong>
                    </p>
                  )}
                </div>

                <div
                  className="
                    mt-5
                    rounded-xl
                    border
                    border-green-200
                    bg-green-100/70
                    px-5
                    py-4
                  "
                >
                  <p
                    className="
                      font-medium
                      text-green-800
                    "
                  >
                    Automatic price pipeline completed
                  </p>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-green-800/80
                    "
                  >
                    The catalog and forecast eligibility data were regenerated,
                    and the 1-week, 2-week, and 4-week price models were
                    retrained and verified automatically.
                  </p>

                  <div
                    className="
                      mt-4
                      grid
                      grid-cols-1
                      sm:grid-cols-3
                      gap-3
                      text-sm
                    "
                  >
                    <ResultItem
                      label="Catalog regenerated"
                      value={applyResult.catalogRegenerated ? "Yes" : "No"}
                    />

                    <ResultItem
                      label="Model retrained"
                      value={applyResult.modelRetrained ? "Yes" : "No"}
                    />

                    <ResultItem
                      label="Catalog rows"
                      value={applyResult.catalogRowCount ?? "—"}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({ label, value }) {
  return (
    <div
      className="
        rounded-xl
        bg-cream
        border
        border-ink/10
        p-4
      "
    >
      <p
        className="
          text-xs
          uppercase
          tracking-wide
          text-ink/50
        "
      >
        {label}
      </p>

      <p
        className="
          mt-1
          text-lg
          font-semibold
          text-ink
          break-words
        "
      >
        {value}
      </p>
    </div>
  );
}

// ============================================================
// RESULT ITEM
// ============================================================

function ResultItem({ label, value }) {
  return (
    <div>
      <span className="text-ink/50">{label}:</span> <strong>{value}</strong>
    </div>
  );
}
