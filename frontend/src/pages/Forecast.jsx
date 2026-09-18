import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";

/* ============================================================
   CHART
   ============================================================ */

function SimpleLineChart({ data = [], unit = "unit" }) {
  const w = 1200;
  const h = 420;

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[220px] sm:h-[300px] rounded-lg bg-white/70 border border-ink/5 flex items-center justify-center px-4 text-center">
        <span className="text-ink/60">No data</span>
      </div>
    );
  }

  /* ==========================================================
     CHART BOUNDS
     ========================================================== */

  const chartLeft = 80;
  const chartRight = 1140;
  const chartTop = 24;
  const chartBottom = 330;

  /*
   * Keep the actual plotted points slightly inside the black
   * border so the line never visually sticks outside it.
   */
  const plotLeft = chartLeft + 5;
  const plotRight = chartRight - 10;

  const plotWidth = plotRight - plotLeft;

  const plotHeight = chartBottom - chartTop;

  /* ==========================================================
     CURRENT INDEX
     ========================================================== */

  const currentIndex = Math.max(
    0,
    data.reduce((last, item, index) => (item.future ? last : index), 0),
  );

  /* ==========================================================
     FORECAST COUNT
     ========================================================== */

  const futureItems = data.filter((item) => item.future);

  const futureCount = futureItems.length;

  /* ==========================================================
     X-AXIS LAYOUT

     Use each point's actual relative-week value.

     Historical examples:
     -11, -10, ... -1, 0

     Forecast examples:
     +1, +2, +4

     This keeps +4w twice as far from +2w as +2w is from +1w.
     ========================================================== */

  const xValues = data.map((item) => Number(item.x) || 0);

  const minX = Math.min(...xValues);

  const maxX = Math.max(...xValues);

  const xRange = maxX - minX || 1;

  const computeX = (index) => {
    const xValue = Number(data[index]?.x) || 0;

    return plotLeft + ((xValue - minX) / xRange) * plotWidth;
  };

  /* ==========================================================
     Y RANGE
     ========================================================== */

  const rawValues = data.map((item) => Number(item.y) || 0);

  const rawMin = Math.min(...rawValues);

  const rawMax = Math.max(...rawValues);

  const rawRange = rawMax - rawMin || 1;

  const padding = rawRange * 0.08;

  const min = rawMin - padding;

  const max = rawMax + padding;

  const range = max - min || 1;

  /* ==========================================================
     Y-AXIS TICKS
     ========================================================== */

  const desiredTicks = 6;

  const roughStep = range / desiredTicks || 1;

  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

  let tickStep =
    candidates.find((candidate) => candidate >= roughStep) ||
    Math.pow(10, Math.floor(Math.log10(roughStep)));

  while (Math.ceil(range / tickStep) > 8) {
    tickStep *= 2;
  }

  const yStart = Math.floor(rawMin / tickStep) * tickStep;

  const yEnd = Math.ceil(rawMax / tickStep) * tickStep;

  /*
   * Plot points and Y-axis ticks use the same Y range.
   */
  const computeY = (index) => {
    const value = Number(data[index]?.y) || 0;

    return chartBottom - ((value - yStart) / (yEnd - yStart || 1)) * plotHeight;
  };

  const computeXY = (index) => {
    return {
      x: computeX(index),
      y: computeY(index),
    };
  };

  const yTicks = [];

  for (let value = yStart; value <= yEnd + tickStep / 100; value += tickStep) {
    yTicks.push(value);
  }

  const computeTickY = (value) => {
    return chartBottom - ((value - yStart) / (yEnd - yStart || 1)) * plotHeight;
  };

  /* ==========================================================
     HOVER
     ========================================================== */

  const svgRef = useRef(null);

  const [hoverIdx, setHoverIdx] = useState(null);

  const handleMove = (event) => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const rect = svg.getBoundingClientRect();

    /*
     * Convert browser coordinates to the SVG's 1200x420
     * coordinate system.
     */

    const mouseX = ((event.clientX - rect.left) / rect.width) * w;

    const mouseY = ((event.clientY - rect.top) / rect.height) * h;

    let nearestIndex = null;

    let nearestDistance = Infinity;

    data.forEach((_, index) => {
      const { x, y } = computeXY(index);

      const xDistance = Math.abs(x - mouseX);

      const yDistance = Math.abs(y - mouseY);

      /*
       * X is weighted more strongly because this is a
       * time-series graph.
       */
      const distance = xDistance + yDistance * 0.1;

      if (distance < nearestDistance) {
        nearestDistance = distance;

        nearestIndex = index;
      }
    });

    /*
     * Only activate hover when the cursor is reasonably
     * close to the plotted data.
     *
     * This prevents the tooltip from appearing on a random
     * node when the mouse is merely somewhere inside the
     * chart.
     */
    if (nearestIndex !== null && nearestDistance <= 65) {
      setHoverIdx(nearestIndex);
    } else {
      setHoverIdx(null);
    }
  };

  const handleLeave = () => {
    setHoverIdx(null);
  };

  /* ==========================================================
     WEEK GRID INDICES

     The chart contains the latest 12 historical weeks. Label
     the past at odd-week intervals, then show each forecast
     returned by the pricing route.
     ========================================================== */

  const gridIndices = new Set();

  /*
   * Use actual relative-week values for historical labels.
   * Show approximately every other historical week, Current,
   * and every forecast point.
   */
  data.forEach((item, index) => {
    const week = Number(item.x);

    if (item.future) {
      gridIndices.add(index);
      return;
    }

    if (week === 0) {
      gridIndices.add(index);
      return;
    }

    if (Number.isFinite(week) && Math.abs(week) % 2 === 1) {
      gridIndices.add(index);
    }
  });

  const gridIndexList = [...gridIndices].sort((a, b) => a - b);

  /* ==========================================================
     WEEK LABEL
     ========================================================== */

  const getWeekLabel = (index) => {
    const item = data[index];

    if (item?.future && item.forecastWeek) {
      return `+${item.forecastWeek}w`;
    }

    const week = Number(item?.x);

    if (week === 0) {
      return "Current";
    }

    if (Number.isFinite(week)) {
      return week > 0 ? `+${week}w` : `${week}w`;
    }

    return "";
  };

  /* ==========================================================
     PRICE FORMAT
     ========================================================== */

  const formatPrice = (value) => {
    const number = Number(value) || 0;

    return `₱${number.toFixed(2)}`;
  };

  /* ==========================================================
     LINE PATHS
     ========================================================== */

  let pastPath = "";
  let futurePath = "";

  /*
   * Historical line.
   */
  data.forEach((item, index) => {
    if (item.future) {
      return;
    }

    const { x, y } = computeXY(index);

    pastPath += pastPath === "" ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  /*
   * Forecast line begins directly at Current.
   */
  if (futureCount > 0) {
    const current = computeXY(currentIndex);

    futurePath = `M ${current.x} ${current.y}`;

    data.forEach((item, index) => {
      if (!item.future) {
        return;
      }

      const { x, y } = computeXY(index);

      futurePath += ` L ${x} ${y}`;
    });
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      className="forecast-chart w-full h-[240px] sm:h-[300px] lg:h-[360px]"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <defs>
        <linearGradient id="chartBg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fbf9ec" />

          <stop offset="100%" stopColor="#eef9fb" />
        </linearGradient>
      </defs>

      {/* ======================================================
          CHART BACKGROUND
          ====================================================== */}

      <rect
        x={chartLeft}
        y={chartTop}
        width={chartRight - chartLeft}
        height={plotHeight}
        rx={10}
        fill="url(#chartBg)"
        stroke="#000"
        strokeWidth={6}
      />

      {/* ======================================================
          HORIZONTAL GRID
          ====================================================== */}

      {yTicks.map((value, index) => {
        const y = computeTickY(value);

        return (
          <line
            key={`horizontal-${index}`}
            x1={chartLeft}
            x2={chartRight}
            y1={y}
            y2={y}
            stroke="#64748b"
            strokeOpacity={0.2}
            strokeWidth={1.2}
          />
        );
      })}

      {/* ======================================================
          VERTICAL GRID
          ====================================================== */}

      {gridIndexList.map((index) => {
        const x = computeX(index);

        const isCurrent = index === currentIndex;

        const isFuture = data[index]?.future;

        return (
          <line
            key={`vertical-${index}`}
            x1={x}
            x2={x}
            y1={chartTop}
            y2={chartBottom}
            stroke="#64748b"
            strokeOpacity={isCurrent ? 0.32 : isFuture ? 0.22 : 0.16}
            strokeWidth={isCurrent ? 2 : 1.2}
          />
        );
      })}

      {/* ======================================================
          CURRENT / FORECAST DIVIDER
          ====================================================== */}

      {futureCount > 0 && (
        <line
          x1={computeX(currentIndex)}
          x2={computeX(currentIndex)}
          y1={chartTop}
          y2={chartBottom}
          stroke="#60a5fa"
          strokeWidth={2}
          strokeOpacity={0.9}
        />
      )}

      {/* ======================================================
          Y AXIS LABELS
          ====================================================== */}

      {yTicks.map((value, index) => {
        const y = computeTickY(value);

        return (
          <text
            key={`ylabel-${index}`}
            x={chartLeft - 12}
            y={y + 4}
            fill="#1f2937"
            fontSize={12}
            textAnchor="end"
          >
            {value}
          </text>
        );
      })}

      {/* ======================================================
          Y AXIS TITLE
          ====================================================== */}

      <text
        x={18}
        y={chartTop + plotHeight / 2}
        transform={`rotate(-90 18 ${chartTop + plotHeight / 2})`}
        fill="#374151"
        fontSize={13}
        textAnchor="middle"
      >
        Price
      </text>

      {/* ======================================================
          HISTORICAL LINE
          ====================================================== */}

      {pastPath && (
        <path
          d={pastPath}
          fill="none"
          stroke="#ef6c00"
          strokeWidth={3.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* ======================================================
          FORECAST LINE
          ====================================================== */}

      {futurePath && (
        <path
          d={futurePath}
          fill="none"
          stroke="#d35400"
          strokeWidth={3.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="8 5"
        />
      )}

      {/* ======================================================
          DATA NODES
          ====================================================== */}

      {data.map((item, index) => {
        const { x, y } = computeXY(index);

        const isCurrent = index === currentIndex;

        const isFuture = !!item.future;

        const isHovered = index === hoverIdx;

        return (
          <g key={`node-${index}`}>
            {isHovered && (
              <circle
                cx={x}
                cy={y}
                r={isCurrent ? 11 : 9}
                fill="none"
                stroke={isFuture ? "#d35400" : "#ef6c00"}
                strokeWidth={2}
                opacity={0.55}
              />
            )}

            <circle
              cx={x}
              cy={y}
              r={isCurrent ? 6 : isFuture ? 5 : 3.5}
              fill={isCurrent ? "#60a5fa" : isFuture ? "#ff8c00" : "#ffb84d"}
            />
          </g>
        );
      })}

      {/* ======================================================
          CURRENT PRICE MARKER
          ====================================================== */}

      {(() => {
        const { x, y } = computeXY(currentIndex);

        const currentPrice = data[currentIndex]?.y ?? 0;

        const boxWidth = 150;

        const boxHeight = 28;

        /*
         * Prefer placing the current label to the LEFT.
         * Current is near the forecast section, so this avoids
         * fighting with the forecast nodes and product image.
         */

        let boxX = x - boxWidth - 12;

        /*
         * If there isn't enough room on the left, move right.
         */
        if (boxX < chartLeft + 8) {
          boxX = x + 12;
        }

        /*
         * Hard horizontal clamp.
         */
        boxX = Math.max(
          chartLeft + 8,
          Math.min(boxX, chartRight - boxWidth - 8),
        );

        /*
         * Position vertically around the current point.
         */
        let boxY = y - boxHeight - 12;

        if (boxY < chartTop + 8) {
          boxY = y + 12;
        }

        /*
         * Hard vertical clamp.
         */
        boxY = Math.max(
          chartTop + 8,
          Math.min(boxY, chartBottom - boxHeight - 8),
        );

        return (
          <g pointerEvents="none">
            <circle cx={x} cy={y} r={6} fill="#60a5fa" />

            <rect
              x={boxX}
              y={boxY}
              rx={6}
              ry={6}
              width={boxWidth}
              height={boxHeight}
              fill="#0f172a"
              opacity={0.96}
            />

            <text x={boxX + 8} y={boxY + 18} fill="#fff" fontSize={12}>
              Current: {formatPrice(currentPrice)}
            </text>
          </g>
        );
      })()}

      {/* ======================================================
          HOVER TOOLTIP
          ====================================================== */}

      {hoverIdx !== null &&
        hoverIdx >= 0 &&
        hoverIdx < data.length &&
        (() => {
          const item = data[hoverIdx];

          const { x, y } = computeXY(hoverIdx);

          const boxWidth = 170;

          const boxHeight = 56;

          let label;

          /* --------------------------------------------------
             Forecast
             -------------------------------------------------- */

          if (item.future) {
            const week = item.forecastWeek || hoverIdx - currentIndex;

            label = `+${week}w (predicted)`;
          } else if (hoverIdx === currentIndex) {
            /* --------------------------------------------------
             Current
             -------------------------------------------------- */
            label = "Current";
          } else {
            /* --------------------------------------------------
             Historical
             -------------------------------------------------- */
            const week = Number(item?.x);

            label = Number.isFinite(week)
              ? week > 0
                ? `+${week}w`
                : `${week}w`
              : "Historical";
          }

          /* --------------------------------------------------
             HORIZONTAL POSITION

             Pick whichever side has enough room.
             -------------------------------------------------- */

          const roomRight = chartRight - x;

          const roomLeft = x - chartLeft;

          let boxX;

          if (roomRight >= boxWidth + 20) {
            boxX = x + 12;
          } else if (roomLeft >= boxWidth + 20) {
            boxX = x - boxWidth - 12;
          } else {
            boxX = chartRight - boxWidth - 8;
          }

          /*
           * Final horizontal clamp.
           */
          boxX = Math.max(
            chartLeft + 8,
            Math.min(boxX, chartRight - boxWidth - 8),
          );

          /* --------------------------------------------------
             VERTICAL POSITION
             -------------------------------------------------- */

          let boxY = y - boxHeight - 12;

          /*
           * If it would go above the chart, put it below.
           */
          if (boxY < chartTop + 8) {
            boxY = y + 12;
          }

          /*
           * Final vertical clamp.
           */
          boxY = Math.max(
            chartTop + 8,
            Math.min(boxY, chartBottom - boxHeight - 8),
          );

          return (
            <g pointerEvents="none">
              <rect
                x={boxX}
                y={boxY}
                rx={6}
                ry={6}
                width={boxWidth}
                height={boxHeight}
                fill="#0f172a"
                opacity={0.97}
              />

              <text
                x={boxX + 9}
                y={boxY + 20}
                fill="#fff"
                fontSize={12}
                fontWeight="500"
              >
                {label}
              </text>

              <text x={boxX + 9} y={boxY + 42} fill="#fff" fontSize={12}>
                {formatPrice(item.y)} per {unit}
              </text>
            </g>
          );
        })()}

      {/* ======================================================
          X AXIS TITLE
          ====================================================== */}

      <text
        x={chartLeft + (chartRight - chartLeft) / 2}
        y={chartBottom + 58}
        fill="#374151"
        fontSize={13}
        textAnchor="middle"
      >
        Weeks
      </text>

      {/* ======================================================
          X AXIS LABELS
          ====================================================== */}

      {gridIndexList.map((index) => {
        const x = computeX(index);

        const isCurrent = index === currentIndex;

        const isFuture = data[index]?.future;

        return (
          <text
            key={`xlabel-${index}`}
            x={x}
            y={chartBottom + 24}
            fill="#374151"
            fontSize={isFuture ? 12 : 11}
            fontWeight={isCurrent ? "600" : isFuture ? "500" : "400"}
            textAnchor="middle"
          >
            {getWeekLabel(index)}
          </text>
        );
      })}
    </svg>
  );
}

/* ============================================================
   MAIN FORECAST PAGE
   ============================================================ */

const PAGE_SIZE = 10;

export default function Forecast() {
  const [searchParams, setSearchParams] = useSearchParams();
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyCategory, setHistoryCategory] = useState("");

  const [productsLoading, setProductsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Cache forecasts used by the table so changing pages does not
  // repeatedly call the model for the same commodity.
  const [tableForecasts, setTableForecasts] = useState({});

  /* ==========================================================
     PRODUCTS
     ========================================================== */

  useEffect(() => {
    let cancelled = false;

    setProductsLoading(true);

    fetch(`${API_BASE}/api/prices/products`)
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok || !data?.success) {
          throw new Error(data?.message || "Failed to retrieve products.");
        }

        return data;
      })
      .then((data) => {
        if (cancelled) return;

        const availableProducts = Array.isArray(data.products)
          ? data.products
          : [];

        setProducts(availableProducts);

        // Do NOT automatically choose the first product.
        // Only open a product when a valid seriesKey was deliberately
        // supplied in the URL.
        const requestedSeriesKey = searchParams.get("seriesKey");

        if (
          requestedSeriesKey &&
          availableProducts.some(
            (product) => product.series_key === requestedSeriesKey,
          )
        ) {
          setSelectedProduct(requestedSeriesKey);
        }
      })
      .catch((err) => {
        if (cancelled) return;

        console.error("Products fetch error", err);
        setError(err.message || "Failed to retrieve products.");
      })
      .finally(() => {
        if (!cancelled) {
          setProductsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [API_BASE]);

  const selectedProductInfo = useMemo(
    () =>
      products.find((product) => product.series_key === selectedProduct) ||
      null,
    [products, selectedProduct],
  );

  /* ==========================================================
     FILTERED PRODUCTS
     ========================================================== */

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    const categoryProducts =
      categoryFilter === "all"
        ? products
        : products.filter(
            (product) =>
              (product.category || "Uncategorized") === categoryFilter,
          );

    if (!query) {
      return categoryProducts;
    }

    return [...categoryProducts]
      .map((product) => ({
        product,
        score: productSearchScore(
          query,
          `${product.category || ""} ${product.commodity || ""} ${
            product.specification || ""
          } ${product.unit || ""}`,
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product);
  }, [categoryFilter, productSearch, products]);

  const categories = useMemo(
    () =>
      [
        ...new Set(
          products.map((product) => product.category || "Uncategorized"),
        ),
      ].sort(),
    [products],
  );

  useEffect(() => {
    setPage(1);
  }, [productSearch, categoryFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PAGE_SIZE),
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;

  const visibleProducts = filteredProducts.slice(
    pageStart,
    pageStart + PAGE_SIZE,
  );

  /* ==========================================================
     TABLE FORECASTS

     Only forecast the 10 visible rows and only if the catalog says
     forecasting is available. This avoids firing ~100 model requests
     every time the page opens.
     ========================================================== */

  useEffect(() => {
    let cancelled = false;

    const missing = visibleProducts.filter(
      (product) =>
        product.forecast_available === true &&
        !Object.prototype.hasOwnProperty.call(
          tableForecasts,
          product.series_key,
        ),
    );

    if (!missing.length) {
      return undefined;
    }

    Promise.all(
      missing.map(async (product) => {
        try {
          const response = await fetch(`${API_BASE}/api/prices/forecast`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              seriesKey: product.series_key,
            }),
          });

          const data = await response.json();

          if (!response.ok || !data?.success) {
            return {
              key: product.series_key,
              value: {
                error: data?.message || "Forecast unavailable",
              },
            };
          }

          return {
            key: product.series_key,
            value: data.forecast,
          };
        } catch (err) {
          return {
            key: product.series_key,
            value: {
              error: err.message || "Forecast unavailable",
            },
          };
        }
      }),
    ).then((results) => {
      if (cancelled) return;

      setTableForecasts((current) => {
        const next = { ...current };

        results.forEach(({ key, value }) => {
          next[key] = value;
        });

        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [API_BASE, visibleProducts, tableForecasts]);

  /* ==========================================================
     SELECTED PRODUCT: FORECAST + HISTORY
     ========================================================== */

  useEffect(() => {
    if (!selectedProduct || !selectedProductInfo) {
      setForecast(null);
      setHistory([]);
      setHistoryCategory("");
      setError(null);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);
    setHistoryCategory("");
    setForecast(null);
    setHistory([]);

    const historyPromise = fetch(
      `${API_BASE}/api/prices/history?seriesKey=${encodeURIComponent(
        selectedProduct,
      )}`,
    ).then(async (response) => {
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Failed to fetch price history.");
      }

      return data;
    });

    // Important: do not call the model for an ineligible commodity.
    const forecastPromise =
      selectedProductInfo.forecast_available === true
        ? fetch(`${API_BASE}/api/prices/forecast`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              seriesKey: selectedProduct,
            }),
          }).then(async (response) => {
            const data = await response.json();

            if (!response.ok || !data?.success) {
              throw new Error(
                data?.message || "Failed to generate price forecast.",
              );
            }

            return data;
          })
        : Promise.resolve(null);

    Promise.all([forecastPromise, historyPromise])
      .then(([forecastData, historyData]) => {
        if (cancelled) return;

        if (forecastData?.forecast) {
          const model = forecastData.forecast;

          setForecast({
            weekly: {
              latestRecordedPrice: model.current_price,
              oneWeek: {
                price: model.forecasts?.["1w"]?.predicted_price,
                percentageChange: getPercentageChange(
                  model.current_price,
                  model.forecasts?.["1w"]?.predicted_price,
                ),
              },
              twoWeek: {
                price: model.forecasts?.["2w"]?.predicted_price,
                percentageChange: getPercentageChange(
                  model.current_price,
                  model.forecasts?.["2w"]?.predicted_price,
                ),
              },
            },
            monthly: {
              oneMonth: {
                price: model.forecasts?.["4w"]?.predicted_price,
                percentageChange: getPercentageChange(
                  model.current_price,
                  model.forecasts?.["4w"]?.predicted_price,
                ),
              },
            },
          });
        }

        setHistoryCategory(historyData.category || "");
        setHistory(
          (historyData.history || []).map((row) => ({
            ...row,
            date: row.weekStart,
          })),
        );
      })
      .catch((err) => {
        if (cancelled) return;

        console.error(err);
        setError(err.message || "Unable to retrieve commodity details.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProduct, selectedProductInfo, API_BASE]);

  const productCategory = selectedProductInfo?.category || historyCategory;

  /* ==========================================================
     DATASET AS-OF DATE
     ========================================================== */

  const asOfDate = useMemo(() => {
    const candidateDates = products
      .map(
        (product) =>
          product.latest_numeric_week ||
          product.latest_week ||
          product.week_start ||
          null,
      )
      .filter(Boolean)
      .map((value) => new Date(`${value}T00:00:00Z`))
      .filter((value) => !Number.isNaN(value.getTime()));

    if (!candidateDates.length) {
      return "Latest approved DA weekly report";
    }

    const latestStart = new Date(
      Math.max(...candidateDates.map((date) => date.getTime())),
    );

    // DA weekly files used by this project cover a 7-day reporting week.
    const latestEnd = new Date(latestStart);
    latestEnd.setUTCDate(latestEnd.getUTCDate() + 6);

    return latestEnd.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }, [products]);

  /* ==========================================================
     HISTORICAL DATA + EXISTING MEMBER GRAPH
     ========================================================== */

  const visibleHistory = history.slice(-12);

  const latestHistoryDate =
    visibleHistory.length > 0
      ? new Date(visibleHistory[visibleHistory.length - 1].date)
      : null;

  const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  const chartData = visibleHistory.map((row) => {
    const rowDate = new Date(row.date);

    const relativeWeek =
      latestHistoryDate &&
      !Number.isNaN(rowDate.getTime()) &&
      !Number.isNaN(latestHistoryDate.getTime())
        ? Math.round(
            (rowDate.getTime() - latestHistoryDate.getTime()) /
              MILLISECONDS_PER_WEEK,
          )
        : 0;

    return {
      x: relativeWeek,
      y: Number(row.price) || 0,
      date: row.date,
      future: false,
    };
  });

  let chartWithFuture = chartData.length ? [...chartData] : [];

  const oneWeekPrice = forecast?.weekly?.oneWeek?.price ?? null;
  const twoWeekPrice = forecast?.weekly?.twoWeek?.price ?? null;
  const fourWeekPrice = forecast?.monthly?.oneMonth?.price ?? null;

  if (chartWithFuture.length > 0) {
    chartWithFuture = chartWithFuture.map((item) => ({
      ...item,
      future: false,
    }));

    if (oneWeekPrice !== null) {
      chartWithFuture.push({
        x: 1,
        y: Number(oneWeekPrice),
        date: "+1w",
        future: true,
        forecastWeek: 1,
      });
    }

    if (twoWeekPrice !== null) {
      chartWithFuture.push({
        x: 2,
        y: Number(twoWeekPrice),
        date: "+2w",
        future: true,
        forecastWeek: 2,
      });
    }

    if (fourWeekPrice !== null) {
      chartWithFuture.push({
        x: 4,
        y: Number(fourWeekPrice),
        date: "+4w",
        future: true,
        forecastWeek: 4,
      });
    }
  }

  /* ==========================================================
     TABLE HELPERS
     ========================================================== */

  const getTableForecast = (product) =>
    tableForecasts[product.series_key] || null;

  const getTableCurrentPrice = (product) => {
    const model = getTableForecast(product);

    const values = [
      model?.current_price,
      product.latest_numeric_price,
      product.current_price,
      product.latest_price,
    ];

    const found = values.find((value) => Number.isFinite(Number(value)));

    return found === undefined ? null : Number(found);
  };

  const getTablePredictedPrice = (product, horizon) => {
    const model = getTableForecast(product);
    const value = model?.forecasts?.[horizon]?.predicted_price;

    return Number.isFinite(Number(value)) ? Number(value) : null;
  };

  const handleSelectProduct = (product) => {
    setSelectedProduct(product.series_key);
    setSearchParams({ seriesKey: product.series_key });

    window.setTimeout(() => {
      document.getElementById("forecast-details")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, var(--color-cream) 0%, #dff6ff 100%)",
      }}
      className="min-h-screen text-ink font-sans flex flex-col"
    >
      <Header />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-5 md:px-6 py-8 sm:py-10 lg:py-12 flex-1">
        {/* ====================================================
            PAGE TITLE
            ==================================================== */}

        <section className="max-w-3xl">
          <p className="text-sm text-teal font-medium">Market price forecast</p>

          <h1 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-display font-bold leading-tight">
            Commodity prices and forecasts
          </h1>

          <p className="mt-3 text-ink/65 leading-relaxed">
            Compare current prices, review short-term forecasts, and select a
            commodity to view its historical price graph and detailed outlook.
          </p>
        </section>

        {/* ====================================================
            DATA INFORMATION
            ==================================================== */}

        <section className="mt-6 sm:mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-2xl bg-white/80 border border-ink/10 p-4 sm:p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-ink/45">
              Price data as of
            </p>
            <p className="mt-1 font-semibold">{asOfDate}</p>
          </div>

          <div className="rounded-2xl bg-white/80 border border-ink/10 p-4 sm:p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-ink/45">
              Tracked commodities
            </p>
            <p className="mt-1 text-2xl font-display font-bold">
              {products.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white/80 border border-ink/10 p-4 sm:p-5 shadow-sm sm:col-span-2 lg:col-span-1">
            <p className="text-xs uppercase tracking-wide text-ink/45">
              Source coverage
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed">
              Department of Agriculture weekly retail price monitoring data used
              by the system.
            </p>
          </div>
        </section>

        {/* ====================================================
            SEARCH + FILTER
            ==================================================== */}

        <section className="mt-8 sm:mt-9">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="font-display font-bold text-xl sm:text-2xl">
                Commodity price list
              </h2>
              <p className="mt-1 text-sm text-ink/55">
                Select a row to open its full forecast and graph.
              </p>
            </div>

            <p className="text-xs text-ink/50">
              Showing {filteredProducts.length ? pageStart + 1 : 0}–
              {Math.min(pageStart + PAGE_SIZE, filteredProducts.length)} of{" "}
              {filteredProducts.length}
            </p>
          </div>

          <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row gap-3">
            <input
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search commodity, specification, or category..."
              className="min-w-0 flex-1 bg-white border border-ink/10 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-teal/30"
              aria-label="Search commodities"
            />

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="sm:w-64 lg:w-72 bg-white border border-ink/10 rounded-xl py-3 px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-teal/30 dark:bg-ink/40"
              aria-label="Filter commodities by category"
            >
              <option value="all">All categories</option>

              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* ====================================================
            COMMODITY LIST
            ==================================================== */}

        <section className="mt-4 rounded-2xl overflow-hidden border border-ink/10 bg-white/90 shadow-sm">
          {productsLoading ? (
            <div className="p-8 sm:p-10 text-center text-sm text-ink/55">
              Loading commodity prices...
            </div>
          ) : (
            <>
              {/* ==============================================
                  MOBILE + TABLET CARDS
                  ============================================== */}

              <div className="lg:hidden divide-y divide-ink/10">
                {visibleProducts.map((product) => {
                  const currentPrice = getTableCurrentPrice(product);
                  const oneWeek = getTablePredictedPrice(product, "1w");
                  const twoWeek = getTablePredictedPrice(product, "2w");
                  const fourWeek = getTablePredictedPrice(product, "4w");
                  const change = getPercentageChange(currentPrice, oneWeek);
                  const tableModel = getTableForecast(product);
                  const waitingForForecast =
                    product.forecast_available === true && !tableModel;
                  const active = selectedProduct === product.series_key;

                  return (
                    <button
                      key={product.series_key}
                      type="button"
                      onClick={() => handleSelectProduct(product)}
                      className={`w-full text-left p-4 sm:p-5 transition-colors ${
                        active ? "bg-teal/10" : "hover:bg-cream-light/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-ink/45">
                            {product.category || "Uncategorized"}
                          </p>

                          <h3 className="mt-1 font-display font-bold text-base sm:text-lg text-ink">
                            {product.commodity}
                          </h3>

                          <p className="mt-1 text-xs text-ink/50 leading-5">
                            {product.specification || "No specification"}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[10px] uppercase tracking-wide text-ink/40">
                            Current
                          </p>

                          <p className="mt-1 font-display font-bold text-lg text-teal-dark">
                            {formatPrice(currentPrice)}
                          </p>

                          <p className="mt-0.5 text-[10px] text-ink/45">
                            per {product.unit || "unit"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-cream-light/80 border border-ink/5 p-3">
                          <p className="text-[10px] text-ink/45">1 week</p>
                          <p className="mt-1 text-sm font-semibold">
                            {waitingForForecast ? "…" : formatPrice(oneWeek)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-cream-light/80 border border-ink/5 p-3">
                          <p className="text-[10px] text-ink/45">2 weeks</p>
                          <p className="mt-1 text-sm font-semibold">
                            {waitingForForecast ? "…" : formatPrice(twoWeek)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-cream-light/80 border border-ink/5 p-3">
                          <p className="text-[10px] text-ink/45">4 weeks</p>
                          <p className="mt-1 text-sm font-semibold">
                            {waitingForForecast ? "…" : formatPrice(fourWeek)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-semibold">
                          {change === null ? (
                            <span className="text-ink/35">1w change —</span>
                          ) : change > 0 ? (
                            <span className="text-red-600">
                              ↑ +{change.toFixed(2)}%
                            </span>
                          ) : change < 0 ? (
                            <span className="text-teal-dark">
                              ↓ {change.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-ink/55">→ 0.00%</span>
                          )}
                        </div>

                        {product.forecast_available === true ? (
                          waitingForForecast ? (
                            <span className="inline-flex rounded-full bg-ink/5 text-ink/55 px-3 py-1 text-[10px] font-medium">
                              Loading forecast
                            </span>
                          ) : tableModel?.error ? (
                            <span className="inline-flex rounded-full bg-red-50 text-red-700 px-3 py-1 text-[10px] font-medium">
                              Retry later
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-teal/10 text-teal-dark px-3 py-1 text-[10px] font-medium">
                              Forecast ready
                            </span>
                          )
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-[10px] font-medium">
                            Building history
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {!visibleProducts.length && (
                  <div className="px-6 py-10 text-center text-sm text-ink/55">
                    No matching commodities found.
                  </div>
                )}
              </div>

              {/* ==============================================
                  DESKTOP TABLE
                  ============================================== */}

              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse">
                  <thead className="bg-ink text-cream-light">
                    <tr className="text-left text-xs uppercase tracking-wide">
                      <th className="px-5 py-4 font-medium">Category</th>
                      <th className="px-5 py-4 font-medium">Commodity</th>
                      <th className="px-4 py-4 font-medium">Unit</th>
                      <th className="px-4 py-4 font-medium">Current</th>
                      <th className="px-4 py-4 font-medium">1 week</th>
                      <th className="px-4 py-4 font-medium">2 weeks</th>
                      <th className="px-4 py-4 font-medium">4 weeks</th>
                      <th className="px-4 py-4 font-medium">1w change</th>
                      <th className="px-4 py-4 font-medium text-right">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleProducts.map((product) => {
                      const currentPrice = getTableCurrentPrice(product);
                      const oneWeek = getTablePredictedPrice(product, "1w");
                      const twoWeek = getTablePredictedPrice(product, "2w");
                      const fourWeek = getTablePredictedPrice(product, "4w");
                      const change = getPercentageChange(currentPrice, oneWeek);
                      const tableModel = getTableForecast(product);
                      const waitingForForecast =
                        product.forecast_available === true && !tableModel;
                      const active = selectedProduct === product.series_key;

                      return (
                        <tr
                          key={product.series_key}
                          tabIndex={0}
                          role="button"
                          onClick={() => handleSelectProduct(product)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleSelectProduct(product);
                            }
                          }}
                          className={`border-b border-ink/5 cursor-pointer transition-colors last:border-b-0 ${
                            active ? "bg-teal/10" : "hover:bg-cream-light/80"
                          }`}
                        >
                          <td className="px-5 py-4 align-middle">
                            <span className="text-xs text-ink/60 leading-snug">
                              {product.category || "Uncategorized"}
                            </span>
                          </td>

                          <td className="px-5 py-4 align-middle">
                            <p className="font-semibold text-sm">
                              {product.commodity}
                            </p>

                            <p className="mt-1 text-xs text-ink/50 max-w-[260px]">
                              {product.specification || "No specification"}
                            </p>
                          </td>

                          <td className="px-4 py-4 text-sm text-ink/60">
                            {product.unit || "—"}
                          </td>

                          <td className="px-4 py-4 font-semibold text-sm text-teal-dark">
                            {formatPrice(currentPrice)}
                          </td>

                          <td className="px-4 py-4 text-sm font-medium">
                            {waitingForForecast ? "…" : formatPrice(oneWeek)}
                          </td>

                          <td className="px-4 py-4 text-sm font-medium">
                            {waitingForForecast ? "…" : formatPrice(twoWeek)}
                          </td>

                          <td className="px-4 py-4 text-sm font-medium">
                            {waitingForForecast ? "…" : formatPrice(fourWeek)}
                          </td>

                          <td className="px-4 py-4 text-sm font-semibold">
                            {change === null ? (
                              <span className="text-ink/35">—</span>
                            ) : change > 0 ? (
                              <span className="text-red-600">
                                ↑ +{change.toFixed(2)}%
                              </span>
                            ) : change < 0 ? (
                              <span className="text-teal-dark">
                                ↓ {change.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-ink/55">→ 0.00%</span>
                            )}
                          </td>

                          <td className="px-4 py-4 text-right">
                            {product.forecast_available === true ? (
                              waitingForForecast ? (
                                <span className="inline-flex rounded-full bg-ink/5 text-ink/55 px-3 py-1 text-[11px] font-medium">
                                  Loading forecast
                                </span>
                              ) : tableModel?.error ? (
                                <span className="inline-flex rounded-full bg-red-50 text-red-700 px-3 py-1 text-[11px] font-medium">
                                  Retry later
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-teal/10 text-teal-dark px-3 py-1 text-[11px] font-medium">
                                  Forecast ready
                                </span>
                              )
                            ) : (
                              <span className="inline-flex rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-[11px] font-medium">
                                Building history
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {!visibleProducts.length && (
                      <tr>
                        <td
                          colSpan="9"
                          className="px-6 py-12 text-center text-sm text-ink/55"
                        >
                          No matching commodities found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ==================================================
              PAGINATION
              ================================================== */}

          <div className="border-t border-ink/10 px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
            <p className="text-xs text-ink/50">
              Page {page} of {totalPages}
            </p>

            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-full border border-ink/15 px-4 py-2 text-xs font-medium hover:bg-cream disabled:opacity-35 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="rounded-full border border-ink/15 px-4 py-2 text-xs font-medium hover:bg-cream disabled:opacity-35 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {/* ====================================================
            TABLE / PAGE ERROR
            ==================================================== */}

        {error && !selectedProduct && (
          <div className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ====================================================
            SELECTED COMMODITY DETAILS
            ==================================================== */}

        {selectedProduct && selectedProductInfo && (
          <section id="forecast-details" className="mt-9 sm:mt-12 scroll-mt-24">
            <div className="rounded-2xl sm:rounded-3xl bg-white/90 border border-ink/10 shadow-sm p-5 sm:p-6 md:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
                <div>
                  <p className="text-sm text-teal font-medium">
                    {productCategory || "Category"}
                  </p>

                  <h2 className="font-display font-bold text-xl sm:text-2xl md:text-3xl mt-1">
                    {selectedProductInfo.commodity}
                  </h2>

                  <p className="text-sm text-ink/55 mt-2">
                    {selectedProductInfo.specification || "No specification"}
                    {" · "}
                    {selectedProductInfo.unit}
                  </p>
                </div>

                <img
                  src={getProductImage(selectedProductInfo.commodity)}
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.style.display = "none";
                  }}
                  alt={selectedProductInfo.commodity || "Product"}
                  className="w-24 h-16 sm:w-28 sm:h-20 object-contain opacity-95 self-start sm:self-auto"
                />
              </div>
            </div>

            {loading && (
              <div className="mt-5 text-sm text-ink/60">
                Loading forecast details...
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {!loading && !error && (
              <>
                {/* ==============================================
                    PRICE SUMMARY
                    ============================================== */}

                <div className="mt-5 sm:mt-6 grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <PriceSummaryCard
                    label="Latest recorded price"
                    value={
                      forecast?.weekly?.latestRecordedPrice ??
                      getTableCurrentPrice(selectedProductInfo)
                    }
                    unit={selectedProductInfo.unit}
                    primary
                  />

                  <PriceSummaryCard
                    label="1-week forecast"
                    value={oneWeekPrice}
                    unit={selectedProductInfo.unit}
                    current={
                      forecast?.weekly?.latestRecordedPrice ??
                      getTableCurrentPrice(selectedProductInfo)
                    }
                  />

                  <PriceSummaryCard
                    label="2-week forecast"
                    value={twoWeekPrice}
                    unit={selectedProductInfo.unit}
                    current={
                      forecast?.weekly?.latestRecordedPrice ??
                      getTableCurrentPrice(selectedProductInfo)
                    }
                  />

                  <PriceSummaryCard
                    label="4-week forecast"
                    value={fourWeekPrice}
                    unit={selectedProductInfo.unit}
                    current={
                      forecast?.weekly?.latestRecordedPrice ??
                      getTableCurrentPrice(selectedProductInfo)
                    }
                  />
                </div>

                {!selectedProductInfo.forecast_available && (
                  <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                    <p className="font-semibold text-amber-900">
                      Forecast not available yet
                    </p>
                    <p className="mt-1 text-sm text-amber-800/80">
                      This commodity does not yet have enough numeric historical
                      observations for the forecasting models. Its available
                      historical prices are still shown below.
                    </p>
                  </div>
                )}

                {/* ==============================================
                    KEEP THE EXISTING MEMBER GRAPH
                    ============================================== */}

                <div className="w-full mt-8 sm:mt-10 relative">
                  <div className="mb-5 text-center">
                    <p className="text-sm text-teal font-medium">Price trend</p>

                    <h3 className="font-display font-bold text-xl sm:text-2xl md:text-3xl mt-1">
                      Historical prices
                      {selectedProductInfo.forecast_available
                        ? " and forecast"
                        : ""}
                    </h3>
                  </div>

                  <div className="w-full rounded-lg overflow-hidden sm:overflow-visible px-0">
                    {chartWithFuture.length ? (
                      <SimpleLineChart
                        unit={selectedProductInfo.unit || "unit"}
                        data={chartWithFuture}
                      />
                    ) : (
                      <div className="w-full h-[300px] rounded-lg bg-white/70 border border-ink/5 flex items-center justify-center">
                        <span className="text-ink/60">
                          No historical price data available.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ==============================================
                    RECOMMENDATION
                    ============================================== */}

                <div className="w-full mt-6 sm:mt-8 bg-cream rounded-2xl p-4 sm:p-6 shadow-sm border border-ink/5">
                  <h3 className="font-semibold">
                    Pricing and inventory guidance
                  </h3>

                  <p className="mt-2 text-ink/70">
                    {selectedProductInfo.forecast_available
                      ? getRecommendation(forecast)
                      : "A forecast-based recommendation will be shown once this commodity has enough historical observations for forecasting."}
                  </p>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ============================================================
   PRICE SUMMARY CARD
   ============================================================ */

function PriceSummaryCard({
  label,
  value,
  unit,
  current = null,
  primary = false,
}) {
  const numericValue = Number(value);
  const hasValue = Number.isFinite(numericValue);
  const change = getPercentageChange(current, value);

  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 shadow-sm border ${
        primary
          ? "bg-ink text-cream-light border-ink"
          : "bg-white border-ink/10"
      }`}
    >
      <p
        className={`text-sm ${primary ? "text-cream-light/60" : "text-ink/55"}`}
      >
        {label}
      </p>

      <p className="mt-3 text-xl sm:text-2xl font-display font-bold">
        {hasValue ? `₱${numericValue.toFixed(2)}` : "—"}
      </p>

      <div className="mt-1 flex items-center justify-between gap-3">
        <span
          className={`text-xs ${
            primary ? "text-cream-light/45" : "text-ink/45"
          }`}
        >
          per {unit || "unit"}
        </span>

        {!primary && change !== null && (
          <span
            className={`text-xs font-semibold ${
              change > 0
                ? "text-red-600"
                : change < 0
                  ? "text-teal-dark"
                  : "text-ink/50"
            }`}
          >
            {change > 0 ? "↑ +" : change < 0 ? "↓ " : "→ "}
            {change.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   HELPERS
   ============================================================ */

function formatPrice(value) {
  const number = Number(value);

  return Number.isFinite(number) ? `₱${number.toFixed(2)}` : "—";
}

function getPercentageChange(current, predicted) {
  const currentNumber = Number(current);
  const predictedNumber = Number(predicted);

  if (
    !Number.isFinite(currentNumber) ||
    !Number.isFinite(predictedNumber) ||
    currentNumber === 0
  ) {
    return null;
  }

  return Number(
    (((predictedNumber - currentNumber) / currentNumber) * 100).toFixed(2),
  );
}

function productSearchScore(query, label) {
  const normalizedLabel = String(label || "").toLowerCase();

  if (normalizedLabel.includes(query)) return 2;

  const words = normalizedLabel.split(/\s+/);

  const closeMatch = words.some((word) => {
    if (Math.abs(word.length - query.length) > 2) return false;

    let differences = 0;

    for (
      let index = 0;
      index < Math.max(word.length, query.length);
      index += 1
    ) {
      if (word[index] !== query[index]) differences += 1;
    }

    return differences <= 2;
  });

  return closeMatch ? 1 : 0;
}

function getProductImage(product) {
  if (!product) {
    return "/products/fruit.png";
  }

  const safeName = product.replace(/\s*\(.+\)/, "").trim();

  const fileName = encodeURIComponent(safeName) + ".png";

  return `/products/ProductImages/${fileName}`;
}

/* ============================================================
   RECOMMENDATION
   ============================================================ */

function getRecommendation(forecast) {
  const current = forecast?.weekly?.latestRecordedPrice;

  const predicted =
    forecast?.weekly?.oneWeek?.price ??
    forecast?.monthly?.oneMonth?.price ??
    null;

  if (
    current === null ||
    current === undefined ||
    predicted === null ||
    predicted === undefined
  ) {
    return "No forecast available.";
  }

  const currentNumber = Number(current);
  const predictedNumber = Number(predicted);

  if (
    !Number.isFinite(currentNumber) ||
    !Number.isFinite(predictedNumber) ||
    currentNumber === 0
  ) {
    return "No forecast available.";
  }

  const percentageChange =
    ((predictedNumber - currentNumber) / currentNumber) * 100;

  if (percentageChange >= 10) {
    return "Maintain adequate inventory, but avoid overstocking perishables.";
  }

  if (percentageChange >= 3 && percentageChange < 10) {
    return "Maintain normal inventory and monitor the increase.";
  }

  if (percentageChange > -3 && percentageChange < 3) {
    return "Maintain normal inventory.";
  }

  if (percentageChange <= -3 && percentageChange > -10) {
    return "Prioritize selling existing inventory and reduce additional purchasing.";
  }

  if (percentageChange <= -10) {
    return "Minimize restocking and prioritize moving existing inventory.";
  }

  return "Maintain normal inventory.";
}
