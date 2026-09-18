import React, { useEffect, useRef, useState } from "react";

import Header from "../components/Header";
import Footer from "../components/Footer";

// ============================================================
// CLASSIFIER PAGE
// ============================================================

export default function Classifier() {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const [selectedFile, setSelectedFile] = useState(null);

  const [previewSrc, setPreviewSrc] = useState(null);

  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState(null);

  const [error, setError] = useState(null);

  // ==========================================================
  // ANALYSIS STAGE
  // ==========================================================

  const [analysisStage, setAnalysisStage] = useState(0);

  // ==========================================================
  // HISTORY
  // ==========================================================

  const [history, setHistory] = useState([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [historyError, setHistoryError] = useState(null);

  const [historyFilter, setHistoryFilter] = useState("all");

  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  const inputRef = useRef(null);

  const resultRef = useRef(null);

  // ==========================================================
  // CLEAN PREVIEW URL
  // ==========================================================

  useEffect(() => {
    return () => {
      if (previewSrc && previewSrc.startsWith("blob:")) {
        URL.revokeObjectURL(previewSrc);
      }
    };
  }, [previewSrc]);

  // ==========================================================
  // LOAD HISTORY
  // ==========================================================

  useEffect(() => {
    fetchHistory();
  }, []);

  // ==========================================================
  // LOADING STAGES
  // ==========================================================

  useEffect(() => {
    if (!loading) {
      setAnalysisStage(0);
      return;
    }

    const timers = [
      setTimeout(() => setAnalysisStage(1), 600),

      setTimeout(() => setAnalysisStage(2), 1300),

      setTimeout(() => setAnalysisStage(3), 2100),
    ];

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [loading]);

  // ==========================================================
  // SCROLL TO RESULT
  // ==========================================================

  useEffect(() => {
    if (result && resultRef.current) {
      const timer = setTimeout(() => {
        resultRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 120);

      return () => clearTimeout(timer);
    }
  }, [result]);

  // ==========================================================
  // FETCH HISTORY
  // ==========================================================

  async function fetchHistory() {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const token = window.localStorage.getItem("mamav_token");

      if (!token) {
        setHistory([]);
        return;
      }

      const response = await fetch(`${API_BASE}/api/spoilage/history`, {
        method: "GET",

        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || "Could not load classification history.",
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.message || "Could not load classification history.",
        );
      }

      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      console.error("History fetch error:", err);

      setHistoryError(err.message || "Could not load classification history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  // ==========================================================
  // ANALYZE IMAGE
  // ==========================================================

  async function analyzeImage(file) {
    setError(null);
    setLoading(true);
    setResult(null);
    setAnalysisStage(0);

    try {
      const token = window.localStorage.getItem("mamav_token");

      if (!token) {
        throw new Error("You must be logged in to analyze an image.");
      }

      const fd = new FormData();

      fd.append("image", file);

      const res = await fetch(`${API_BASE}/api/spoilage/analyze`, {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
        },

        body: fd,
      });

      const bodyText = await res.text();

      let data = null;

      if (!res.ok) {
        try {
          const errJson = JSON.parse(bodyText);

          throw new Error(errJson.message || JSON.stringify(errJson));
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) {
            throw new Error(bodyText || res.statusText);
          }

          throw parseErr;
        }
      }

      try {
        data = JSON.parse(bodyText);
      } catch {
        data = {};
      }

      // ======================================================
      // CONDITION
      // ======================================================

      const label = data.label || data.prediction || null;

      let confidence = null;

      if (typeof data.treeProbability === "number") {
        confidence = data.treeProbability;
      } else if (typeof data.confidence === "number") {
        confidence = data.confidence;
      } else if (typeof data.confidence_score === "number") {
        confidence = data.confidence_score;
      } else if (data.scores && typeof data.scores[0] === "number") {
        confidence = data.scores[0];
      }

      // ======================================================
      // SPOILAGE TYPE
      // ======================================================

      const spoilageType =
        data.spoilageType || data.labelName || data.spoilage_type || null;

      // ======================================================
      // SPOILAGE CONFIDENCE
      // ======================================================

      const spoilageConfidence =
        typeof data.spoilageConfidence === "number"
          ? data.spoilageConfidence
          : typeof data.spoilage_confidence === "number"
            ? data.spoilage_confidence
            : null;

      // ======================================================
      // SAVE RESULT
      // ======================================================

      setResult({
        label,

        confidence,

        spoilageType,

        spoilageConfidence,

        recommendation: data.recommendation || null,

        status: data.status || null,

        raw: data,
      });

      if (data.status === "classified") {
        fetchHistory();
      }
    } catch (err) {
      console.error(err);

      setError(err.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // FILE CHANGE
  // ==========================================================

  function onFileChange(event) {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      return;
    }

    setSelectedFile(file);
    setResult(null);
    setError(null);

    if (previewSrc && previewSrc.startsWith("blob:")) {
      URL.revokeObjectURL(previewSrc);
    }

    const url = URL.createObjectURL(file);

    setPreviewSrc(url);
  }

  // ==========================================================
  // CLEAR IMAGE
  // ==========================================================

  function clearImage() {
    if (previewSrc && previewSrc.startsWith("blob:")) {
      URL.revokeObjectURL(previewSrc);
    }

    setSelectedFile(null);
    setPreviewSrc(null);
    setResult(null);
    setError(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  // ==========================================================
  // HISTORY FILTERING
  // ==========================================================

  const filteredHistory = history.filter((item) => {
    if (historyFilter === "all") {
      return true;
    }

    return item.prediction?.toLowerCase() === historyFilter;
  });

  const freshCount = history.filter(
    (item) => item.prediction?.toLowerCase() === "fresh",
  ).length;

  const rottenCount = history.filter(
    (item) => item.prediction?.toLowerCase() === "rotten",
  ).length;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <>
      <style>
        {`
          @keyframes classifierResultIn {
            0% {
              opacity: 0;
              transform: translateY(14px);
            }

            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .classifier-result-enter {
            animation:
              classifierResultIn
              320ms
              ease-out
              both;
          }

          @media (
            prefers-reduced-motion:
            reduce
          ) {
            .classifier-result-enter {
              animation: none;
            }
          }
        `}
      </style>

      <div
        style={{
          background:
            "linear-gradient(180deg, var(--color-cream) 0%, #dff6ff 100%)",
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
            max-w-6xl
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
          {/* ==================================================
              INTRO
              ================================================== */}

          <section
            className="
              text-center
              max-w-3xl
              mx-auto
            "
          >
            <h1
              className="
                text-3xl
                sm:text-4xl
                lg:text-5xl
                font-display
                font-bold
                tracking-tight
              "
            >
              Product Spoilage Classification
            </h1>

            <p
              className="
                mt-4
                text-sm
                sm:text-base
                text-ink/65
                leading-relaxed
              "
            >
              Upload a clear image of a fruit or vegetable to classify its
              visual condition as Fresh or Rotten.
            </p>
          </section>

          {/* ==================================================
              UPLOAD PANEL
              ================================================== */}

          <section
            className="
              mt-8
              sm:mt-10
              max-w-4xl
              mx-auto
            "
          >
            <div
              className="
                bg-white/80
                backdrop-blur-sm
                border
                border-white
                rounded-3xl
                shadow-sm
                p-5
                sm:p-7
                md:p-8
              "
            >
              <div
                className="
                  grid
                  grid-cols-1
                  lg:grid-cols-[300px_minmax(0,1fr)]
                  gap-6
                  sm:gap-8
                  items-center
                "
              >
                {/* IMAGE PREVIEW */}

                <div
                  className="
                    flex
                    justify-center
                  "
                >
                  <div
                    className="
                      relative
                      w-full
                      max-w-[260px]
                      sm:max-w-[300px]
                      aspect-square
                      rounded-3xl
                      overflow-hidden
                      bg-cream-light
                      border
                      border-ink/10
                    "
                  >
                    {previewSrc ? (
                      <img
                        src={previewSrc}
                        alt="Uploaded product preview"
                        className="
                          w-full
                          h-full
                          object-cover
                        "
                      />
                    ) : (
                      <div
                        className="
                          w-full
                          h-full
                          flex
                          flex-col
                          items-center
                          justify-center
                          px-8
                          text-center
                        "
                      >
                        <div
                          className="
                            w-14
                            h-14
                            rounded-2xl
                            bg-white
                            border
                            border-ink/10
                            flex
                            items-center
                            justify-center
                            text-2xl
                          "
                        >
                          +
                        </div>

                        <div
                          className="
                            mt-4
                            font-medium
                          "
                        >
                          No image selected
                        </div>

                        <p
                          className="
                            mt-1
                            text-xs
                            text-ink/45
                          "
                        >
                          JPEG, PNG or WebP up to 20 MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* CONTROLS */}

                <div className="min-w-0 w-full">
                  <h2
                    className="
                      text-xl
                      sm:text-2xl
                      font-semibold
                    "
                  >
                    Upload a product image
                  </h2>

                  <p
                    className="
                      mt-2
                      text-sm
                      text-ink/55
                      leading-relaxed
                    "
                  >
                    Use a clear and well-lit image where the fruit or vegetable
                    is easy to see.
                  </p>

                  {selectedFile && (
                    <div
                      className="
                        mt-5
                        w-full
                        min-w-0
                        max-w-full
                        overflow-hidden
                        rounded-2xl
                        bg-cream-light
                        border
                        border-ink/10
                        px-4
                        py-3
                      "
                    >
                      <div
                        className="
                          text-xs
                          text-ink/45
                        "
                      >
                        Selected image
                      </div>

                      <div
                        className="
                          mt-1
                          block
                          w-full
                          min-w-0
                          max-w-full
                          overflow-hidden
                          text-ellipsis
                          whitespace-nowrap
                          text-sm
                          font-medium
                        "
                        title={selectedFile.name}
                      >
                        {selectedFile.name}
                      </div>
                    </div>
                  )}

                  <input
                    ref={inputRef}
                    type="file"
                    accept="
                      image/jpeg,
                      image/png,
                      image/webp
                    "
                    onChange={onFileChange}
                    className="hidden"
                  />

                  <div
                    className="
                      mt-6
                      flex
                      flex-col
                      md:flex-row
                      gap-3
                    "
                  >
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => inputRef.current?.click()}
                      className="
                        flex-1
                        px-5
                        py-3
                        rounded-xl
                        bg-white
                        border
                        border-ink/15
                        font-medium
                        text-sm
                        hover:bg-cream-light
                        transition
                        disabled:opacity-50
                      "
                    >
                      Choose image
                    </button>

                    <button
                      type="button"
                      disabled={loading || !selectedFile}
                      onClick={() => analyzeImage(selectedFile)}
                      className="
                        flex-1
                        px-5
                        py-3
                        rounded-xl
                        bg-ink
                        text-white
                        font-semibold
                        text-sm
                        hover:opacity-90
                        transition
                        disabled:opacity-40
                        disabled:cursor-not-allowed
                      "
                    >
                      {loading ? "Analyzing..." : "Analyze image"}
                    </button>
                  </div>

                  {selectedFile && (
                    <button
                      type="button"
                      onClick={clearImage}
                      disabled={loading}
                      className="
                        mt-3
                        text-sm
                        text-ink/45
                        hover:text-red-600
                        transition
                        disabled:opacity-40
                      "
                    >
                      Remove selected image
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ==================================================
                LOADING
                ================================================== */}

            {loading && <AnalysisLoading stage={analysisStage} />}

            {/* ==================================================
                ERROR
                ================================================== */}

            {error && (
              <div
                className="
                  mt-6
                  rounded-2xl
                  bg-red-50
                  border
                  border-red-200
                  px-5
                  py-4
                  text-sm
                  text-red-700
                  classifier-result-enter
                "
              >
                <div
                  className="
                    font-semibold
                  "
                >
                  Analysis failed
                </div>

                <div className="mt-1">{error}</div>
              </div>
            )}

            {/* ==================================================
                RESULT
                ================================================== */}

            {result && (
              <div
                ref={resultRef}
                className="
                  mt-7
                  classifier-result-enter
                "
              >
                <ClassifierResult result={result} />
              </div>
            )}
          </section>

          {/* ==================================================
              HISTORY
              ================================================== */}

          <section className="mt-14 sm:mt-16 lg:mt-20">
            <div
              className="
                flex
                flex-col
                sm:flex-row
                sm:items-end
                sm:justify-between
                gap-4
                sm:gap-5
              "
            >
              <div>
                <h2
                  className="
                    text-sm
                    text-green-700
                    font-medium
                  "
                >
                  Classification history
                </h2>

                <h3
                  className="
                    mt-2
                    text-2xl
                    md:text-3xl
                    font-display
                    font-bold
                  "
                >
                  Recent classifications
                </h3>

                <p
                  className="
                    mt-2
                    text-sm
                    text-ink/60
                  "
                >
                  Review your latest Fresh and Rotten classification results.
                </p>
              </div>

              <div
                className="
                  text-sm
                  text-ink/50
                "
              >
                {history.length} of 20 saved records
              </div>
            </div>

            {/* FILTERS */}

            <div
              className="
                mt-6
                flex
                flex-wrap
                gap-2
              "
            >
              <HistoryFilterButton
                active={historyFilter === "all"}
                onClick={() => setHistoryFilter("all")}
              >
                All ({history.length})
              </HistoryFilterButton>

              <HistoryFilterButton
                active={historyFilter === "fresh"}
                onClick={() => setHistoryFilter("fresh")}
              >
                Fresh ({freshCount})
              </HistoryFilterButton>

              <HistoryFilterButton
                active={historyFilter === "rotten"}
                onClick={() => setHistoryFilter("rotten")}
              >
                Rotten ({rottenCount})
              </HistoryFilterButton>
            </div>

            {historyLoading && (
              <div
                className="
                  mt-6
                  bg-white/70
                  border
                  border-ink/10
                  rounded-2xl
                  p-8
                  text-center
                  text-ink/60
                "
              >
                Loading classification history...
              </div>
            )}

            {!historyLoading && historyError && (
              <div
                className="
                    mt-6
                    bg-red-50
                    border
                    border-red-200
                    rounded-2xl
                    p-5
                    text-red-700
                    text-sm
                  "
              >
                {historyError}
              </div>
            )}

            {!historyLoading && !historyError && history.length === 0 && (
              <div
                className="
                    mt-6
                    bg-white/60
                    border
                    border-dashed
                    border-ink/15
                    rounded-2xl
                    p-10
                    text-center
                  "
              >
                <div
                  className="
                      text-lg
                      font-semibold
                    "
                >
                  No classification history yet
                </div>

                <p
                  className="
                      mt-2
                      text-sm
                      text-ink/55
                    "
                >
                  Analyze a fruit or vegetable image and your result will appear
                  here.
                </p>
              </div>
            )}

            {!historyLoading &&
              !historyError &&
              history.length > 0 &&
              filteredHistory.length === 0 && (
                <div
                  className="
                    mt-6
                    bg-white/60
                    border
                    border-ink/10
                    rounded-2xl
                    p-8
                    text-center
                    text-sm
                    text-ink/55
                  "
                >
                  No {historyFilter} classifications found.
                </div>
              )}

            {!historyLoading && !historyError && filteredHistory.length > 0 && (
              <HistoryTable
                history={filteredHistory}
                expandedHistoryId={expandedHistoryId}
                setExpandedHistoryId={setExpandedHistoryId}
              />
            )}
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}

// ============================================================
// LOADING
// ============================================================

function AnalysisLoading({ stage }) {
  const stages = [
    "Preparing image",
    "Validating produce",
    "Extracting visual features",
    "Classifying condition",
  ];

  return (
    <div
      className="
        mt-6
        bg-white
        border
        border-ink/10
        rounded-2xl
        px-5
        py-4
        shadow-sm
      "
    >
      <div
        className="
          flex
          items-center
          gap-4
        "
      >
        <div
          className="
            w-8
            h-8
            rounded-full
            border-[3px]
            border-ink/10
            border-t-green-600
            animate-spin
            shrink-0
          "
        />

        <div>
          <div
            className="
              text-sm
              font-semibold
            "
          >
            Analyzing image
          </div>

          <div
            className="
              mt-0.5
              text-xs
              text-ink/50
            "
          >
            {stages[Math.min(stage, stages.length - 1)]}
            ...
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RESULT
// ============================================================

function ClassifierResult({ result }) {
  if (result.status === "rejected_non_produce") {
    return (
      <StatusMessage
        title="Unsupported image"
        message={
          result.raw?.message ||
          "Please upload a clear image of a fruit or vegetable."
        }
        type="error"
      />
    );
  }

  if (result.status === "unfamiliar_produce") {
    return (
      <StatusMessage
        title="Classification uncertain"
        message={
          result.raw?.message ||
          result.recommendation ||
          "This produce image is outside the model's familiar range."
        }
        type="warning"
      />
    );
  }

  if (result.status !== "classified") {
    return null;
  }

  const isRotten = result.label?.toLowerCase() === "rotten";

  const isFresh = result.label?.toLowerCase() === "fresh";

  return (
    <div
      className="
        bg-white
        rounded-3xl
        border
        border-ink/10
        shadow-sm
        overflow-hidden
      "
    >
      {/* MAIN RESULT */}

      <div
        className="
          p-6
          sm:p-8
        "
      >
        <div
          className="
            flex
            flex-col
            lg:flex-row
            lg:items-start
            lg:justify-between
            gap-5
            sm:gap-6
          "
        >
          <div>
            <div
              className="
                text-xs
                uppercase
                tracking-[0.16em]
                font-semibold
                text-ink/40
              "
            >
              Classification result
            </div>

            <div className="mt-4">
              <div
                className={`
                  text-4xl
                  font-bold
                  ${isRotten ? "text-red-700" : "text-green-700"}
                `}
              >
                {result.label || "Unknown"}
              </div>

              <div
                className="
                  mt-1
                  text-sm
                  text-ink/50
                "
              >
                {isFresh
                  ? "The product was classified as Fresh."
                  : "The product was classified as Rotten."}
              </div>
            </div>
          </div>

          <div
            className="
              lg:text-right
            "
          >
            <div
              className="
                text-xs
                text-ink/45
              "
            >
              Decision Tree confidence
            </div>

            <div
              className="
                mt-1
                text-3xl
                font-bold
              "
            >
              {formatConfidence(result.confidence)}
            </div>
          </div>
        </div>

        <div className="mt-7">
          <ConfidenceBar
            value={result.confidence}
            type={isRotten ? "rotten" : "fresh"}
          />
        </div>
      </div>

      {/* ROTTEN DETAILS */}

      {isRotten && (
        <div
          className="
            border-t
            border-ink/10
            p-6
            sm:p-8
          "
        >
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
                bg-red-50
                border
                border-red-100
                p-5
              "
            >
              <div
                className="
                  text-xs
                  text-ink/45
                  uppercase
                  tracking-wide
                  font-semibold
                "
              >
                Visible spoilage indicator
              </div>

              <div
                className="
                  mt-2
                  text-2xl
                  font-bold
                  text-red-700
                "
              >
                {result.spoilageType || "Not identified"}
              </div>
            </div>

            <div
              className="
                rounded-2xl
                bg-red-50
                border
                border-red-100
                p-5
              "
            >
              <div
                className="
                  text-xs
                  text-ink/45
                  uppercase
                  tracking-wide
                  font-semibold
                "
              >
                Indicator confidence
              </div>

              <div
                className="
                  mt-2
                  text-2xl
                  font-bold
                "
              >
                {formatConfidence(result.spoilageConfidence)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECOMMENDATION */}

      <div
        className="
          border-t
          border-ink/10
          p-6
          sm:p-8
        "
      >
        <div
          className="
            flex
            gap-4
            items-start
          "
        >
          <div
            className="
              w-9
              h-9
              rounded-xl
              bg-cream-light
              border
              border-ink/10
              flex
              items-center
              justify-center
              font-semibold
              shrink-0
            "
          >
            i
          </div>

          <div>
            <div
              className="
                font-semibold
              "
            >
              Recommendation
            </div>

            <p
              className="
                mt-1
                text-sm
                sm:text-base
                leading-relaxed
                text-ink/65
              "
            >
              {result.recommendation ||
                "Inspect the product manually before making an inventory decision."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STATUS MESSAGE
// ============================================================

function StatusMessage({ title, message, type }) {
  const warning = type === "warning";

  return (
    <div
      className={`
        rounded-2xl
        border
        p-6
        sm:p-8
        bg-white
        ${warning ? "border-yellow-200" : "border-red-200"}
      `}
    >
      <div
        className={`
          text-lg
          font-bold
          ${warning ? "text-yellow-700" : "text-red-700"}
        `}
      >
        {title}
      </div>

      <p
        className="
          mt-2
          text-sm
          leading-relaxed
          text-ink/65
        "
      >
        {message}
      </p>
    </div>
  );
}

// ============================================================
// CONFIDENCE BAR
// ============================================================

function ConfidenceBar({ value, type = "fresh" }) {
  const pct =
    typeof value === "number" ? Math.max(0, Math.min(100, value * 100)) : 0;

  return (
    <div
      className="
        h-2
        bg-ink/10
        rounded-full
        overflow-hidden
      "
    >
      <div
        className={`
          h-full
          rounded-full
          transition-all
          duration-700
          ${type === "rotten" ? "bg-red-500" : "bg-green-500"}
        `}
        style={{
          width: `${pct}%`,
        }}
      />
    </div>
  );
}

// ============================================================
// HISTORY TABLE
// ============================================================

function HistoryTable({ history, expandedHistoryId, setExpandedHistoryId }) {
  return (
    <div
      className="
        mt-6
        bg-white
        border
        border-ink/10
        rounded-2xl
        overflow-hidden
        shadow-sm
      "
    >
      {/* ======================================================
          MOBILE + TABLET HISTORY CARDS
          ====================================================== */}

      <div className="lg:hidden divide-y divide-ink/10">
        {history.map((item) => {
          const isExpanded = expandedHistoryId === item.id;

          const prediction = item.prediction || "Unknown";

          const isRotten = prediction.toLowerCase() === "rotten";

          const isFresh = prediction.toLowerCase() === "fresh";

          return (
            <article
              key={item.id}
              className="
                p-4
                sm:p-5
              "
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedHistoryId(isExpanded ? null : item.id)
                }
                className="
                  w-full
                  text-left
                "
              >
                <div
                  className="
                    flex
                    items-start
                    gap-4
                  "
                >
                  {/* IMAGE */}

                  <div
                    className="
                      w-16
                      h-16
                      sm:w-20
                      sm:h-20

                      rounded-xl
                      overflow-hidden

                      bg-cream-light

                      border
                      border-ink/10

                      shrink-0
                    "
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.originalFilename || "Classification"}
                        className="
                          w-full
                          h-full
                          object-cover
                        "
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="
                          w-full
                          h-full

                          flex
                          items-center
                          justify-center

                          text-[10px]
                          text-ink/40
                        "
                      >
                        No image
                      </div>
                    )}
                  </div>

                  {/* MAIN INFO */}

                  <div className="min-w-0 flex-1">
                    <div
                      className="
                        flex
                        flex-wrap
                        items-start
                        justify-between

                        gap-2
                      "
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="
                            text-sm
                            font-semibold
                            text-ink

                            truncate
                          "
                          title={item.originalFilename}
                        >
                          {item.originalFilename || "Uploaded image"}
                        </p>

                        <p
                          className="
                            mt-1

                            text-xs
                            text-ink/50
                          "
                        >
                          {formatHistoryDate(item.createdAt)}
                        </p>
                      </div>

                      <span
                        className={`
                          inline-flex

                          rounded-full

                          px-3
                          py-1

                          text-[11px]
                          font-semibold

                          shrink-0

                          ${
                            isRotten
                              ? "bg-red-50 text-red-700"
                              : isFresh
                                ? "bg-green-50 text-green-700"
                                : "bg-yellow-50 text-yellow-700"
                          }
                        `}
                      >
                        {prediction}
                      </span>
                    </div>

                    <div
                      className="
                        mt-3

                        grid
                        grid-cols-2

                        gap-2
                      "
                    >
                      <div
                        className="
                          rounded-xl

                          bg-cream-light/70

                          border
                          border-ink/5

                          p-3
                        "
                      >
                        <p
                          className="
                            text-[10px]
                            uppercase
                            tracking-wide

                            text-ink/40
                          "
                        >
                          Confidence
                        </p>

                        <p
                          className="
                            mt-1

                            text-sm
                            font-semibold
                          "
                        >
                          {formatConfidence(item.treeProbability)}
                        </p>
                      </div>

                      <div
                        className="
                          rounded-xl

                          bg-cream-light/70

                          border
                          border-ink/5

                          p-3
                        "
                      >
                        <p
                          className="
                            text-[10px]
                            uppercase
                            tracking-wide

                            text-ink/40
                          "
                        >
                          Spoilage indicator
                        </p>

                        <p
                          className={`
                            mt-1

                            text-sm
                            font-semibold

                            truncate

                            ${isRotten ? "text-red-700" : "text-ink/45"}
                          `}
                          title={
                            isRotten && item.spoilageType
                              ? item.spoilageType
                              : ""
                          }
                        >
                          {isRotten && item.spoilageType
                            ? item.spoilageType
                            : "—"}
                        </p>
                      </div>
                    </div>

                    <div
                      className="
                        mt-3

                        flex
                        items-center
                        justify-between

                        gap-3
                      "
                    >
                      <p
                        className="
                          text-xs
                          text-ink/45
                        "
                      >
                        {isRotten
                          ? `Indicator confidence: ${formatConfidence(
                              item.spoilageConfidence,
                            )}`
                          : "No spoilage indicator"}
                      </p>

                      <span
                        className="
                          text-xs
                          font-medium
                          text-teal-dark

                          shrink-0
                        "
                      >
                        {isExpanded ? "Hide details" : "View details"}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* EXPANDED DETAILS */}

              {isExpanded && (
                <div
                  className="
                    mt-4

                    pt-4

                    border-t
                    border-ink/10

                    grid
                    grid-cols-1
                    sm:grid-cols-2

                    gap-4
                  "
                >
                  <div>
                    <div
                      className="
                        text-xs
                        uppercase
                        tracking-wide
                        text-ink/45
                        font-semibold
                      "
                    >
                      Recommendation
                    </div>

                    <p
                      className="
                        mt-2

                        text-sm
                        leading-relaxed
                        text-ink/70
                      "
                    >
                      {item.recommendation || "No recommendation available."}
                    </p>
                  </div>

                  <div>
                    <div
                      className="
                        text-xs
                        uppercase
                        tracking-wide
                        text-ink/45
                        font-semibold
                      "
                    >
                      Classification details
                    </div>

                    <div
                      className="
                        mt-2

                        space-y-2

                        text-sm
                        text-ink/65
                      "
                    >
                      <p>
                        Fresh probability:{" "}
                        <strong>
                          {formatConfidence(item.classProbabilities?.fresh)}
                        </strong>
                      </p>

                      <p>
                        Rotten probability:{" "}
                        <strong>
                          {formatConfidence(item.classProbabilities?.rotten)}
                        </strong>
                      </p>

                      {item.novelty?.novelty_level && (
                        <p>
                          Familiarity:{" "}
                          <strong>
                            {formatNoveltyLabel(item.novelty.novelty_level)}
                          </strong>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ======================================================
          DESKTOP HISTORY TABLE
          ====================================================== */}

      <div
        className="
          hidden
          lg:block

          w-full
          overflow-x-auto
        "
      >
        <table
          className="
            w-full
            min-w-[920px]
            border-collapse
          "
        >
          <thead
            className="
              bg-ink/[0.04]
            "
          >
            <tr>
              <TableHeading>Image</TableHeading>

              <TableHeading>File</TableHeading>

              <TableHeading>Result</TableHeading>

              <TableHeading>Confidence</TableHeading>

              <TableHeading>Spoilage indicator</TableHeading>

              <TableHeading>Indicator confidence</TableHeading>

              <TableHeading>Date</TableHeading>

              <TableHeading center>Details</TableHeading>
            </tr>
          </thead>

          <tbody>
            {history.map((item) => {
              const isExpanded = expandedHistoryId === item.id;

              const prediction = item.prediction || "Unknown";

              const isRotten = prediction.toLowerCase() === "rotten";

              const isFresh = prediction.toLowerCase() === "fresh";

              return (
                <React.Fragment key={item.id}>
                  <tr
                    onClick={() =>
                      setExpandedHistoryId(isExpanded ? null : item.id)
                    }
                    className="
                      border-t
                      border-ink/10

                      hover:bg-cream-light/60

                      cursor-pointer

                      transition-colors
                    "
                  >
                    <td className="px-5 py-4">
                      <div
                        className="
                          w-14
                          h-14

                          rounded-xl
                          overflow-hidden

                          bg-cream-light

                          border
                          border-ink/10
                        "
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.originalFilename || "Classification"}
                            className="
                              w-full
                              h-full
                              object-cover
                            "
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="
                              w-full
                              h-full

                              flex
                              items-center
                              justify-center

                              text-[10px]
                              text-ink/40
                            "
                          >
                            No image
                          </div>
                        )}
                      </div>
                    </td>

                    <td
                      className="
                        px-4
                        py-4

                        max-w-[220px]
                      "
                    >
                      <div
                        className="
                          text-sm
                          font-medium

                          truncate
                        "
                        title={item.originalFilename}
                      >
                        {item.originalFilename || "Uploaded image"}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`
                          inline-flex

                          rounded-full

                          px-3
                          py-1

                          text-xs
                          font-semibold

                          ${
                            isRotten
                              ? "bg-red-50 text-red-700"
                              : isFresh
                                ? "bg-green-50 text-green-700"
                                : "bg-yellow-50 text-yellow-700"
                          }
                        `}
                      >
                        {prediction}
                      </span>
                    </td>

                    <td
                      className="
                        px-4
                        py-4

                        text-sm
                        font-semibold
                      "
                    >
                      {formatConfidence(item.treeProbability)}
                    </td>

                    <td
                      className="
                        px-4
                        py-4
                        text-sm
                      "
                    >
                      {isRotten && item.spoilageType ? (
                        <span className="font-medium text-red-700">
                          {item.spoilageType}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td
                      className="
                        px-4
                        py-4
                        text-sm
                      "
                    >
                      {isRotten
                        ? formatConfidence(item.spoilageConfidence)
                        : "—"}
                    </td>

                    <td
                      className="
                        px-4
                        py-4

                        text-sm
                        text-ink/60

                        whitespace-nowrap
                      "
                    >
                      {formatHistoryDate(item.createdAt)}
                    </td>

                    <td
                      className="
                        px-4
                        py-4

                        text-center
                      "
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();

                          setExpandedHistoryId(isExpanded ? null : item.id);
                        }}
                        className="
                          px-3
                          py-1.5

                          rounded-full

                          text-xs
                          font-medium

                          border
                          border-ink/10

                          bg-white

                          hover:bg-cream-light

                          transition
                        "
                      >
                        {isExpanded ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr
                      className="
                        border-t
                        border-ink/10

                        bg-cream-light/50
                      "
                    >
                      <td
                        colSpan="8"
                        className="
                          px-6
                          py-5
                        "
                      >
                        <div
                          className="
                            grid
                            grid-cols-1
                            lg:grid-cols-2

                            gap-5
                            sm:gap-6
                          "
                        >
                          <div>
                            <div
                              className="
                                text-xs
                                uppercase
                                tracking-wide
                                text-ink/45
                                font-semibold
                              "
                            >
                              Recommendation
                            </div>

                            <p
                              className="
                                mt-2

                                text-sm
                                leading-relaxed
                                text-ink/70
                              "
                            >
                              {item.recommendation ||
                                "No recommendation available."}
                            </p>
                          </div>

                          <div>
                            <div
                              className="
                                text-xs
                                uppercase
                                tracking-wide
                                text-ink/45
                                font-semibold
                              "
                            >
                              Classification details
                            </div>

                            <div
                              className="
                                mt-2

                                space-y-2

                                text-sm
                                text-ink/65
                              "
                            >
                              <p>
                                Fresh probability:{" "}
                                <strong>
                                  {formatConfidence(
                                    item.classProbabilities?.fresh,
                                  )}
                                </strong>
                              </p>

                              <p>
                                Rotten probability:{" "}
                                <strong>
                                  {formatConfidence(
                                    item.classProbabilities?.rotten,
                                  )}
                                </strong>
                              </p>

                              {item.novelty?.novelty_level && (
                                <p>
                                  Familiarity:{" "}
                                  <strong>
                                    {formatNoveltyLabel(
                                      item.novelty.novelty_level,
                                    )}
                                  </strong>
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ======================================================
          FOOTER
          ====================================================== */}

      <div
        className="
          px-4
          sm:px-5

          py-4

          border-t
          border-ink/10

          flex
          flex-col
          sm:flex-row

          sm:items-center
          sm:justify-between

          gap-2
        "
      >
        <p className="text-xs text-ink/50">
          Showing {history.length} record
          {history.length === 1 ? "" : "s"}
        </p>

        <p className="text-xs text-ink/40">
          Select a record to view its recommendation and classification details.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// TABLE HEADING
// ============================================================

function TableHeading({ children, center = false }) {
  return (
    <th
      className={`
        px-4
        py-4
        text-xs
        font-semibold
        text-ink/55
        ${center ? "text-center" : "text-left"}
      `}
    >
      {children}
    </th>
  );
}

// ============================================================
// HISTORY FILTER BUTTON
// ============================================================

function HistoryFilterButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-4
        py-2
        rounded-full
        text-sm
        font-medium
        border
        transition
        ${
          active
            ? "bg-ink text-cream-light border-ink"
            : "bg-white text-ink/70 border-ink/10 hover:bg-cream-light"
        }
      `}
    >
      {children}
    </button>
  );
}

// ============================================================
// FORMAT CONFIDENCE
// ============================================================

function formatConfidence(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

// ============================================================
// FORMAT DATE
// ============================================================

function formatHistoryDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ============================================================
// FORMAT NOVELTY
// ============================================================

function formatNoveltyLabel(value) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
