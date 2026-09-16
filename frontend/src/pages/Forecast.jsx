import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { useSearchParams } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";

/* ============================================================
   CHART
   ============================================================ */

function SimpleLineChart({
  data = [],
  unit = "unit",
}) {
  const w = 1200;
  const h = 420;

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[300px] rounded-lg bg-white/70 border border-ink/5 flex items-center justify-center">
        <span className="text-ink/60">
          No data
        </span>
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

  const plotWidth =
    plotRight - plotLeft;

  const plotHeight =
    chartBottom - chartTop;

  /* ==========================================================
     CURRENT INDEX
     ========================================================== */

  const currentIndex = Math.max(
    0,
    data.reduce(
      (last, item, index) =>
        item.future
          ? last
          : index,
      0
    )
  );

  /* ==========================================================
     FORECAST COUNT
     ========================================================== */

  const futureItems =
    data.filter(
      (item) => item.future
    );

  const futureCount =
    futureItems.length;

  /* ==========================================================
     X-AXIS LAYOUT

     Use each point's actual relative-week value.

     Historical examples:
     -11, -10, ... -1, 0

     Forecast examples:
     +1, +2, +4

     This keeps +4w twice as far from +2w as +2w is from +1w.
     ========================================================== */

  const xValues =
    data.map(
      (item) =>
        Number(item.x) || 0
    );

  const minX =
    Math.min(
      ...xValues
    );

  const maxX =
    Math.max(
      ...xValues
    );

  const xRange =
    maxX - minX || 1;

  const computeX = (
    index
  ) => {
    const xValue =
      Number(
        data[index]?.x
      ) || 0;

    return (
      plotLeft +
      ((xValue - minX) /
        xRange) *
        plotWidth
    );
  };

  /* ==========================================================
     Y RANGE
     ========================================================== */

  const rawValues =
    data.map(
      (item) =>
        Number(item.y) || 0
    );

  const rawMin =
    Math.min(
      ...rawValues
    );

  const rawMax =
    Math.max(
      ...rawValues
    );

  const rawRange =
    rawMax - rawMin || 1;

  const padding =
    rawRange * 0.08;

  const min =
    rawMin - padding;

  const max =
    rawMax + padding;

  const range =
    max - min || 1;

  /* ==========================================================
     Y-AXIS TICKS
     ========================================================== */

  const desiredTicks = 6;

  const roughStep =
    range /
      desiredTicks ||
    1;

  const candidates = [
    1,
    2,
    5,
    10,
    20,
    50,
    100,
    200,
    500,
    1000,
    2000,
    5000,
  ];

  let tickStep =
    candidates.find(
      (candidate) =>
        candidate >=
        roughStep
    ) ||
    Math.pow(
      10,
      Math.floor(
        Math.log10(
          roughStep
        )
      )
    );

  while (
    Math.ceil(
      range / tickStep
    ) > 8
  ) {
    tickStep *= 2;
  }

  const yStart =
    Math.floor(
      rawMin /
        tickStep
    ) *
    tickStep;

  const yEnd =
    Math.ceil(
      rawMax /
        tickStep
    ) *
    tickStep;

  /*
   * Plot points and Y-axis ticks use the same Y range.
   */
  const computeY = (
    index
  ) => {
    const value =
      Number(
        data[index]?.y
      ) || 0;

    return (
      chartBottom -
      ((value - yStart) /
        (yEnd - yStart || 1)) *
        plotHeight
    );
  };

  const computeXY = (
    index
  ) => {
    return {
      x: computeX(index),
      y: computeY(index),
    };
  };

  const yTicks = [];

  for (
    let value = yStart;
    value <=
    yEnd +
      tickStep / 100;
    value +=
      tickStep
  ) {
    yTicks.push(
      value
    );
  }

  const computeTickY = (
    value
  ) => {
    return (
      chartBottom -
      ((value - yStart) /
        (yEnd - yStart ||
          1)) *
        plotHeight
    );
  };

  /* ==========================================================
     HOVER
     ========================================================== */

  const svgRef =
    useRef(null);

  const [
    hoverIdx,
    setHoverIdx,
  ] = useState(null);

  const handleMove = (
    event
  ) => {
    const svg =
      svgRef.current;

    if (!svg) {
      return;
    }

    const rect =
      svg.getBoundingClientRect();

    /*
     * Convert browser coordinates to the SVG's 1200x420
     * coordinate system.
     */

    const mouseX =
      ((event.clientX -
        rect.left) /
        rect.width) *
      w;

    const mouseY =
      ((event.clientY -
        rect.top) /
        rect.height) *
      h;

    let nearestIndex =
      null;

    let nearestDistance =
      Infinity;

    data.forEach(
      (_, index) => {
        const {
          x,
          y,
        } =
          computeXY(
            index
          );

        const xDistance =
          Math.abs(
            x - mouseX
          );

        const yDistance =
          Math.abs(
            y - mouseY
          );

        /*
         * X is weighted more strongly because this is a
         * time-series graph.
         */
        const distance =
          xDistance +
          yDistance *
            0.10;

        if (
          distance <
          nearestDistance
        ) {
          nearestDistance =
            distance;

          nearestIndex =
            index;
        }
      }
    );

    /*
     * Only activate hover when the cursor is reasonably
     * close to the plotted data.
     *
     * This prevents the tooltip from appearing on a random
     * node when the mouse is merely somewhere inside the
     * chart.
     */
    if (
      nearestIndex !==
        null &&
      nearestDistance <=
        65
    ) {
      setHoverIdx(
        nearestIndex
      );
    } else {
      setHoverIdx(null);
    }
  };

  const handleLeave =
    () => {
      setHoverIdx(null);
    };

  /* ==========================================================
     WEEK GRID INDICES

     The chart contains the latest 12 historical weeks. Label
     the past at odd-week intervals, then show each forecast
     returned by the pricing route.
     ========================================================== */

  const gridIndices =
    new Set();

  /*
   * Use actual relative-week values for historical labels.
   * Show approximately every other historical week, Current,
   * and every forecast point.
   */
  data.forEach(
    (item, index) => {
      const week =
        Number(item.x);

      if (
        item.future
      ) {
        gridIndices.add(
          index
        );
        return;
      }

      if (
        week === 0
      ) {
        gridIndices.add(
          index
        );
        return;
      }

      if (
        Number.isFinite(week) &&
        Math.abs(week) % 2 === 1
      ) {
        gridIndices.add(
          index
        );
      }
    }
  );

  const gridIndexList =
    [
      ...gridIndices,
    ].sort(
      (a, b) =>
        a - b
    );

  /* ==========================================================
     WEEK LABEL
     ========================================================== */

  const getWeekLabel =
    (index) => {
      const item =
        data[index];

      if (
        item?.future &&
        item.forecastWeek
      ) {
        return `+${item.forecastWeek}w`;
      }

      const week =
        Number(
          item?.x
        );

      if (
        week === 0
      ) {
        return "Current";
      }

      if (
        Number.isFinite(week)
      ) {
        return week > 0
          ? `+${week}w`
          : `${week}w`;
      }

      return "";
    };

  /* ==========================================================
     PRICE FORMAT
     ========================================================== */

  const formatPrice =
    (value) => {
      const number =
        Number(value) || 0;

      return `₱${number.toFixed(
        2
      )}`;
    };

  /* ==========================================================
     LINE PATHS
     ========================================================== */

  let pastPath = "";
  let futurePath = "";

  /*
   * Historical line.
   */
  data.forEach(
    (item, index) => {
      if (
        item.future
      ) {
        return;
      }

      const {
        x,
        y,
      } =
        computeXY(
          index
        );

      pastPath +=
        pastPath === ""
          ? `M ${x} ${y}`
          : ` L ${x} ${y}`;
    }
  );

  /*
   * Forecast line begins directly at Current.
   */
  if (
    futureCount >
    0
  ) {
    const current =
      computeXY(
        currentIndex
      );

    futurePath =
      `M ${current.x} ${current.y}`;

    data.forEach(
      (item, index) => {
        if (
          !item.future
        ) {
          return;
        }

        const {
          x,
          y,
        } =
          computeXY(
            index
          );

        futurePath +=
          ` L ${x} ${y}`;
      }
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      className="forecast-chart w-full h-[360px]"
      onMouseMove={
        handleMove
      }
      onMouseLeave={
        handleLeave
      }
    >
      <defs>
        <linearGradient
          id="chartBg"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor="#fbf9ec"
          />

          <stop
            offset="100%"
            stopColor="#eef9fb"
          />
        </linearGradient>
      </defs>

      {/* ======================================================
          CHART BACKGROUND
          ====================================================== */}

      <rect
        x={chartLeft}
        y={chartTop}
        width={
          chartRight -
          chartLeft
        }
        height={
          plotHeight
        }
        rx={10}
        fill="url(#chartBg)"
        stroke="#000"
        strokeWidth={6}
      />

      {/* ======================================================
          HORIZONTAL GRID
          ====================================================== */}

      {yTicks.map(
        (
          value,
          index
        ) => {
          const y =
            computeTickY(
              value
            );

          return (
            <line
              key={`horizontal-${index}`}
              x1={
                chartLeft
              }
              x2={
                chartRight
              }
              y1={y}
              y2={y}
              stroke="#64748b"
              strokeOpacity={
                0.20
              }
              strokeWidth={
                1.2
              }
            />
          );
        }
      )}

      {/* ======================================================
          VERTICAL GRID
          ====================================================== */}

      {gridIndexList.map(
        (index) => {
          const x =
            computeX(
              index
            );

          const isCurrent =
            index ===
            currentIndex;

          const isFuture =
            data[index]
              ?.future;

          return (
            <line
              key={`vertical-${index}`}
              x1={x}
              x2={x}
              y1={
                chartTop
              }
              y2={
                chartBottom
              }
              stroke="#64748b"
              strokeOpacity={
                isCurrent
                  ? 0.32
                  : isFuture
                  ? 0.22
                  : 0.16
              }
              strokeWidth={
                isCurrent
                  ? 2
                  : 1.2
              }
            />
          );
        }
      )}

      {/* ======================================================
          CURRENT / FORECAST DIVIDER
          ====================================================== */}

      {futureCount >
        0 && (
        <line
          x1={computeX(
            currentIndex
          )}
          x2={computeX(
            currentIndex
          )}
          y1={
            chartTop
          }
          y2={
            chartBottom
          }
          stroke="#60a5fa"
          strokeWidth={2}
          strokeOpacity={
            0.9
          }
        />
      )}

      {/* ======================================================
          Y AXIS LABELS
          ====================================================== */}

      {yTicks.map(
        (
          value,
          index
        ) => {
          const y =
            computeTickY(
              value
            );

          return (
            <text
              key={`ylabel-${index}`}
              x={
                chartLeft -
                12
              }
              y={
                y + 4
              }
              fill="#1f2937"
              fontSize={12}
              textAnchor="end"
            >
              {value}
            </text>
          );
        }
      )}

      {/* ======================================================
          Y AXIS TITLE
          ====================================================== */}

      <text
        x={18}
        y={
          chartTop +
          plotHeight / 2
        }
        transform={`rotate(-90 18 ${
          chartTop +
          plotHeight / 2
        })`}
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

      {data.map(
        (
          item,
          index
        ) => {
          const {
            x,
            y,
          } =
            computeXY(
              index
            );

          const isCurrent =
            index ===
            currentIndex;

          const isFuture =
            !!item.future;

          const isHovered =
            index ===
            hoverIdx;

          return (
            <g
              key={`node-${index}`}
            >
              {isHovered && (
                <circle
                  cx={x}
                  cy={y}
                  r={
                    isCurrent
                      ? 11
                      : 9
                  }
                  fill="none"
                  stroke={
                    isFuture
                      ? "#d35400"
                      : "#ef6c00"
                  }
                  strokeWidth={2}
                  opacity={0.55}
                />
              )}

              <circle
                cx={x}
                cy={y}
                r={
                  isCurrent
                    ? 6
                    : isFuture
                    ? 5
                    : 3.5
                }
                fill={
                  isCurrent
                    ? "#60a5fa"
                    : isFuture
                    ? "#ff8c00"
                    : "#ffb84d"
                }
              />
            </g>
          );
        }
      )}

      {/* ======================================================
          CURRENT PRICE MARKER
          ====================================================== */}

      {(() => {
        const {
          x,
          y,
        } =
          computeXY(
            currentIndex
          );

        const currentPrice =
          data[
            currentIndex
          ]?.y ?? 0;

        const boxWidth =
          150;

        const boxHeight =
          28;

        /*
         * Prefer placing the current label to the LEFT.
         * Current is near the forecast section, so this avoids
         * fighting with the forecast nodes and product image.
         */

        let boxX =
          x -
          boxWidth -
          12;

        /*
         * If there isn't enough room on the left, move right.
         */
        if (
          boxX <
          chartLeft + 8
        ) {
          boxX =
            x + 12;
        }

        /*
         * Hard horizontal clamp.
         */
        boxX =
          Math.max(
            chartLeft + 8,
            Math.min(
              boxX,
              chartRight -
                boxWidth -
                8
            )
          );

        /*
         * Position vertically around the current point.
         */
        let boxY =
          y -
          boxHeight -
          12;

        if (
          boxY <
          chartTop + 8
        ) {
          boxY =
            y + 12;
        }

        /*
         * Hard vertical clamp.
         */
        boxY =
          Math.max(
            chartTop + 8,
            Math.min(
              boxY,
              chartBottom -
                boxHeight -
                8
            )
          );

        return (
          <g
            pointerEvents="none"
          >
            <circle
              cx={x}
              cy={y}
              r={6}
              fill="#60a5fa"
            />

            <rect
              x={boxX}
              y={boxY}
              rx={6}
              ry={6}
              width={
                boxWidth
              }
              height={
                boxHeight
              }
              fill="#0f172a"
              opacity={0.96}
            />

            <text
              x={
                boxX + 8
              }
              y={
                boxY + 18
              }
              fill="#fff"
              fontSize={12}
            >
              Current:{" "}
              {formatPrice(
                currentPrice
              )}
            </text>
          </g>
        );
      })()}

      {/* ======================================================
          HOVER TOOLTIP
          ====================================================== */}

      {hoverIdx !==
        null &&
        hoverIdx >=
          0 &&
        hoverIdx <
          data.length &&
        (() => {
          const item =
            data[
              hoverIdx
            ];

          const {
            x,
            y,
          } =
            computeXY(
              hoverIdx
            );

          const boxWidth =
            170;

          const boxHeight =
            56;

          let label;

          /* --------------------------------------------------
             Forecast
             -------------------------------------------------- */

          if (
            item.future
          ) {
            const week =
              item.forecastWeek ||
              hoverIdx -
                currentIndex;

            label =
              `+${week}w (predicted)`;
          }

          /* --------------------------------------------------
             Current
             -------------------------------------------------- */

          else if (
            hoverIdx ===
            currentIndex
          ) {
            label =
              "Current";
          }

          /* --------------------------------------------------
             Historical
             -------------------------------------------------- */

          else {
            const week =
              Number(
                item?.x
              );

            label =
              Number.isFinite(week)
                ? week > 0
                  ? `+${week}w`
                  : `${week}w`
                : "Historical";
          }

          /* --------------------------------------------------
             HORIZONTAL POSITION

             Pick whichever side has enough room.
             -------------------------------------------------- */

          const roomRight =
            chartRight -
            x;

          const roomLeft =
            x -
            chartLeft;

          let boxX;

          if (
            roomRight >=
            boxWidth +
              20
          ) {
            boxX =
              x + 12;
          } else if (
            roomLeft >=
            boxWidth +
              20
          ) {
            boxX =
              x -
              boxWidth -
              12;
          } else {
            boxX =
              chartRight -
              boxWidth -
              8;
          }

          /*
           * Final horizontal clamp.
           */
          boxX =
            Math.max(
              chartLeft + 8,
              Math.min(
                boxX,
                chartRight -
                  boxWidth -
                  8
              )
            );

          /* --------------------------------------------------
             VERTICAL POSITION
             -------------------------------------------------- */

          let boxY =
            y -
            boxHeight -
            12;

          /*
           * If it would go above the chart, put it below.
           */
          if (
            boxY <
            chartTop + 8
          ) {
            boxY =
              y + 12;
          }

          /*
           * Final vertical clamp.
           */
          boxY =
            Math.max(
              chartTop + 8,
              Math.min(
                boxY,
                chartBottom -
                  boxHeight -
                  8
              )
            );

          return (
            <g
              pointerEvents="none"
            >
              <rect
                x={boxX}
                y={boxY}
                rx={6}
                ry={6}
                width={
                  boxWidth
                }
                height={
                  boxHeight
                }
                fill="#0f172a"
                opacity={0.97}
              />

              <text
                x={
                  boxX + 9
                }
                y={
                  boxY + 20
                }
                fill="#fff"
                fontSize={12}
                fontWeight="500"
              >
                {label}
              </text>

              <text
                x={
                  boxX + 9
                }
                y={
                  boxY + 42
                }
                fill="#fff"
                fontSize={12}
              >
                {formatPrice(
                  item.y
                )}{" "}
                per {unit}
              </text>
            </g>
          );
        })()}

      {/* ======================================================
          X AXIS TITLE
          ====================================================== */}

      <text
        x={
          chartLeft +
          (chartRight -
            chartLeft) /
            2
        }
        y={
          chartBottom + 58
        }
        fill="#374151"
        fontSize={13}
        textAnchor="middle"
      >
        Weeks
      </text>

      {/* ======================================================
          X AXIS LABELS
          ====================================================== */}

      {gridIndexList.map(
        (index) => {
          const x =
            computeX(
              index
            );

          const isCurrent =
            index ===
            currentIndex;

          const isFuture =
            data[index]
              ?.future;

          return (
            <text
              key={`xlabel-${index}`}
              x={x}
              y={
                chartBottom +
                24
              }
              fill="#374151"
              fontSize={
                isFuture
                  ? 12
                  : 11
              }
              fontWeight={
                isCurrent
                  ? "600"
                  : isFuture
                  ? "500"
                  : "400"
              }
              textAnchor="middle"
            >
              {getWeekLabel(
                index
              )}
            </text>
          );
        }
      )}
    </svg>
  );
}

/* ============================================================
   MAIN FORECAST PAGE
   ============================================================ */

export default function Forecast() {
  const [searchParams] = useSearchParams();
  const API_BASE =
    import.meta.env
      .VITE_API_URL ||
    "http://localhost:5000";

  const [
    products,
    setProducts,
  ] = useState([]);

  const [
    selectedProduct,
    setSelectedProduct,
  ] = useState(null);

  const [
    forecast,
    setForecast,
  ] = useState(null);

  const [
    history,
    setHistory,
  ] = useState([]);
  const [
    historyCategory,
    setHistoryCategory,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  /* ==========================================================
     PRODUCTS
     ========================================================== */

  useEffect(() => {
    fetch(
      `${API_BASE}/api/prices/products`
    )
      .then(
        (response) =>
          response.json()
      )
      .then((data) => {
        if (
          data &&
          data.success
        ) {
          const availableProducts =
            data.products ||
            [];

          setProducts(
            availableProducts
          );

          if (availableProducts.length > 0) {
            const requestedSeriesKey = searchParams.get("seriesKey");
            const requestedProduct = availableProducts.find(
              (product) => product.series_key === requestedSeriesKey,
            );
            setSelectedProduct(
              requestedProduct?.series_key || availableProducts[0].series_key
            );
          }
        } else {
          throw new Error(data?.message || "Failed to retrieve products.");
        }
      })
      .catch((err) => {
        console.error(
          "Products fetch error",
          err
        );
      });
  }, [API_BASE, searchParams]);

  /* ==========================================================
     FORECAST + HISTORY
     ========================================================== */

  useEffect(() => {
    if (
      !selectedProduct
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    setHistoryCategory("");

    const forecastPromise = fetch(`${API_BASE}/api/prices/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesKey: selectedProduct }),
    }).then((response) => response.json());

    const historyPromise = fetch(
      `${API_BASE}/api/prices/history?seriesKey=${encodeURIComponent(selectedProduct)}`,
    ).then((response) => response.json());

    Promise.all([
      forecastPromise,
      historyPromise,
    ])
      .then(
        ([
          forecastData,
          historyData,
        ]) => {
          if (
            !forecastData ||
            !forecastData.success
          ) {
            setError(
              forecastData?.message ||
                "Failed to fetch forecast"
            );
          } else {
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

          if (
            !historyData ||
            !historyData.success
          ) {
            setHistory([]);
          } else {
            setHistoryCategory(historyData.category || "");
            setHistory((historyData.history || []).map((row) => ({
              ...row,
              date: row.weekStart,
            })));
          }
        }
      )
      .catch((err) => {
        console.error(err);

        setError(
          err.message ||
            "Fetch error"
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    selectedProduct,
    API_BASE,
  ]);

  const selectedProductInfo = products.find(
    (product) => product.series_key === selectedProduct,
  );
  const productCategory =
    selectedProductInfo?.category ||
    historyCategory;

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    const categoryProducts = categoryFilter === "all"
      ? products
      : products.filter((product) => (product.category || "Uncategorized") === categoryFilter);
    if (!query) return categoryProducts;

    return [...categoryProducts]
      .map((product) => ({
        product,
        score: productSearchScore(
          query,
          `${product.category} ${product.commodity} ${product.specification}`,
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product);
  }, [categoryFilter, productSearch, products]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category || "Uncategorized"))].sort(),
    [products],
  );

  /* ==========================================================
     HISTORICAL DATA
     ========================================================== */

  const visibleHistory =
    history.slice(-12);

  const latestHistoryDate =
    visibleHistory.length > 0
      ? new Date(
          visibleHistory[
            visibleHistory.length - 1
          ].date
        )
      : null;

  const MILLISECONDS_PER_WEEK =
    7 * 24 * 60 * 60 * 1000;

  const chartData =
    visibleHistory.map(
      (row) => {
        const rowDate =
          new Date(
            row.date
          );

        const relativeWeek =
          latestHistoryDate &&
          !Number.isNaN(
            rowDate.getTime()
          ) &&
          !Number.isNaN(
            latestHistoryDate.getTime()
          )
            ? Math.round(
                (rowDate.getTime() -
                  latestHistoryDate.getTime()) /
                  MILLISECONDS_PER_WEEK
              )
            : 0;

        return {
          x: relativeWeek,
          y:
            Number(
              row.price
            ) || 0,
          date: row.date,
          future: false,
        };
      }
    );

  let chartWithFuture =
    chartData.length
      ? [...chartData]
      : [];

  /* ==========================================================
     FORECAST DATA
     
     +1w, +2w, and +4w come directly from priceRoutes.
     ========================================================== */

  const oneWeekPrice =
    forecast?.weekly
      ?.oneWeek?.price ??
    null;

  const twoWeekPrice =
    forecast?.weekly
      ?.twoWeek?.price ??
    null;

  const fourWeekPrice =
    forecast?.monthly
      ?.oneMonth?.price ??
    null;

  if (
    chartWithFuture.length >
    0
  ) {
    /*
     * Ensure historical points are explicitly marked
     * as non-future.
     */
    chartWithFuture =
      chartWithFuture.map(
        (item) => ({
          ...item,
          future: false,
        })
      );

    /* ========================================================
       BOTH WEEKLY + MONTHLY FORECAST AVAILABLE
       ======================================================== */

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

      <main className="max-w-6xl mx-auto px-6 py-16 flex-1">

        {/* ====================================================
            PAGE TITLE
            ==================================================== */}

        <section className="text-center">
          <h2 className="text-sm text-green-700 font-medium">
            Price forecast
          </h2>

          <h1 className="mt-4 text-3xl md:text-4xl font-display font-bold">
            Where is the price headed?
          </h1>

          <p className="mt-3 text-ink/70 max-w-2xl mx-auto">
            Select a product to
            view historical and
            forecasted prices.
          </p>
        </section>

        {/* ====================================================
            PRODUCT SELECTOR
            ==================================================== */}

        <section className="mt-10 flex flex-col items-center gap-6">

          <div className="max-w-2xl w-full flex flex-col sm:flex-row gap-3">
            <input
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search commodities..."
              className="min-w-0 flex-1 bg-white/80 border border-ink/10 rounded-full py-3 px-5 text-sm"
              aria-label="Search commodities"
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="sm:w-64 bg-white/80 border border-ink/10 rounded-full py-3 px-5 text-sm text-ink outline-none focus:ring-2 focus:ring-teal/40 dark:bg-ink/40"
              aria-label="Filter commodities by category"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
            <div className="mt-3 max-h-44 overflow-y-auto rounded-2xl bg-white/70 border border-ink/10 p-2 grid sm:grid-cols-2 gap-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.series_key}
                  type="button"
                  onClick={() => setSelectedProduct(product.series_key)}
                  className={`text-left rounded-xl px-4 py-3 transition-colors ${
                    selectedProduct === product.series_key
                      ? "bg-ink text-cream-light"
                      : "hover:bg-cream-light"
                  }`}
                >
                  <span className="block text-xs opacity-60">
                    {product.category}
                  </span>
                  <span className="block font-medium mt-1">
                    {product.commodity}
                  </span>
                  <span className="block text-xs opacity-65 mt-1">
                    {product.specification} · {product.unit}
                  </span>
                </button>
              ))}
              {!filteredProducts.length && (
                <p className="sm:col-span-2 px-4 py-3 text-sm text-ink/60">
                  No matching commodities found.
                </p>
              )}
            </div>

          {/* ==================================================
              LOADING / ERROR
              ================================================== */}

          {loading && (
            <div className="text-sm text-ink/60">
              Loading forecast...
            </div>
          )}

          {error && (
            <div className="w-full max-w-2xl rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* ==================================================
              GRAPH
              ================================================== */}

          <div className="w-full mt-14 relative">
            <div className="mb-5 text-center">
              <p className="text-sm text-teal font-medium">
                {productCategory || "Category"}
              </p>

              <h2 className="font-display font-bold text-2xl md:text-3xl mt-1">
                {selectedProductInfo?.commodity || "Loading product..."}
              </h2>

              {selectedProductInfo?.specification && (
                <p className="text-sm text-ink/60 mt-1">
                  {selectedProductInfo.specification} · {selectedProductInfo.unit}
                </p>
              )}
            </div>

            {/*
             * Product image sits ABOVE the chart border,
             * rather than inside the SVG.
             *
             * This means it can never overlap:
             * - the historical line
             * - the forecast line
             * - graph nodes
             * - grid lines
             * - hover tooltip
             */}

            <img
              src={getProductImage(selectedProductInfo?.commodity)}
              onError={(event) => {
                event.currentTarget.onerror =
                  null;

                /*
                 * Do not show an unrelated fallback image.
                 * If the matching commodity image is missing,
                 * hide the decorative image instead.
                 */
                event.currentTarget.style.display =
                  "none";
              }}
              alt={
                selectedProductInfo?.commodity ||
                "Product"
              }
              className="
                absolute
                right-10
                -top-8
                w-28
                h-20
                object-contain
                opacity-95
                pointer-events-none
                z-20
              "
            />

            <div className="w-full rounded-lg overflow-visible px-0">
              <SimpleLineChart
                unit={selectedProductInfo?.unit || "unit"}
                data={
                  chartWithFuture.length
                    ? chartWithFuture
                    : [
                        {
                          x: 0,
                          y: 0,
                          future:
                            false,
                        },
                      ]
                }
              />
            </div>
          </div>

          {/* ==================================================
              PRICE CARDS
              ================================================== */}

          <div className="w-full mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 justify-items-center">

            {/* ==================================================
                CURRENT PRICE
                ================================================== */}

            <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-sm border border-ink/5">

              <div className="text-sm text-ink/70">
                Latest Recorded Price
              </div>

              <div className="mt-3 text-2xl font-bold">
                {forecast?.weekly
                  ?.latestRecordedPrice
                  ? `₱${forecast.weekly.latestRecordedPrice}`
                  : "—"}

                <span className="text-sm text-ink/60">
                  {" "}
                  per {selectedProductInfo?.unit || "unit"}
                </span>
              </div>

            </div>

            {/* ==================================================
                PREDICTED PRICE
                ================================================== */}

            <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-sm border border-ink/5">

              <div className="text-sm text-ink/70">
                Predicted Price in 1w / 1m
              </div>

              <div className="mt-3 text-2xl font-bold">

                {forecast?.weekly
                  ?.oneWeek?.price
                  ? `₱${forecast.weekly.oneWeek.price}`
                  : "—"}

                <span className="text-sm text-ink/60">
                  {" "}
                  per {selectedProductInfo?.unit || "unit"}
                </span>

                {forecast?.monthly
                  ?.oneMonth?.price && (
                  <>
                    <span className="text-2xl font-bold">
                      {" "}
                      / ₱
                      {
                        forecast
                          .monthly
                          .oneMonth
                          .price
                      }
                    </span>

                    <span className="text-sm text-ink/60">
                      {" "}
                      per {selectedProductInfo?.unit || "unit"}
                    </span>
                  </>
                )}

              </div>
            </div>

          </div>

          {/* ==================================================
              RECOMMENDATION
              ================================================== */}

          <div className="w-full mt-8 bg-cream rounded-2xl p-6 shadow-sm border border-ink/5">

            <h3 className="font-semibold">
              Recommendation
            </h3>

            <p className="mt-2 text-ink/70">
              {getRecommendation(
                forecast
              )}
            </p>

          </div>

        </section>
      </main>

      <Footer />
    </div>
  );
}

/* ============================================================
   PRODUCT IMAGE
   ============================================================ */

  function getPercentageChange(current, predicted) {
    if (
      typeof current !== "number" ||
      typeof predicted !== "number" ||
      current === 0
    ) {
      return null;
    }

    return Number((((predicted - current) / current) * 100).toFixed(2));
  }

  function productSearchScore(query, label) {
    const normalizedLabel = label.toLowerCase();
    if (normalizedLabel.includes(query)) return 2;

    const words = normalizedLabel.split(/\s+/);
    const closeMatch = words.some((word) => {
      if (Math.abs(word.length - query.length) > 2) return false;
      let differences = 0;
      for (let index = 0; index < Math.max(word.length, query.length); index += 1) {
        if (word[index] !== query[index]) differences += 1;
      }
      return differences <= 2;
    });

    return closeMatch ? 1 : 0;
  }

  function getProductImage(
  product
  ) {
  if (!product) {
    return "/products/fruit.png";
  }

  /*
   * Remove variants such as:
   *
   * Pechay (Baguio)
   *
   * -> Pechay
   */

  const safeName =
    product
      .replace(
        /\s*\(.+\)/,
        ""
      )
      .trim();

  const fileName =
    encodeURIComponent(
      safeName
    ) + ".png";

  return `/products/ProductImages/${fileName}`;
}

/* ============================================================
   RECOMMENDATION
   ============================================================ */

function getRecommendation(
  forecast
) {
  const current =
    forecast?.weekly
      ?.latestRecordedPrice;

  const predicted =
    forecast?.weekly
      ?.oneWeek?.price ??
    forecast?.monthly
      ?.oneMonth?.price ??
    null;

  if (
    current ===
      null ||
    current ===
      undefined ||
    predicted ===
      null ||
    predicted ===
      undefined
  ) {
    return "No forecast available.";
  }

  const currentNumber =
    Number(current);

  const predictedNumber =
    Number(predicted);

  if (
    !Number.isFinite(
      currentNumber
    ) ||
    !Number.isFinite(
      predictedNumber
    ) ||
    currentNumber === 0
  ) {
    return "No forecast available.";
  }

  const percentageChange =
    ((predictedNumber -
      currentNumber) /
      currentNumber) *
    100;

  if (
    percentageChange >=
    10
  ) {
    return "Maintain adequate inventory, but avoid overstocking perishables.";
  }

  if (
    percentageChange >=
      3 &&
    percentageChange <
      10
  ) {
    return "Maintain normal inventory and monitor the increase.";
  }

  if (
    percentageChange >
      -3 &&
    percentageChange <
      3
  ) {
    return "Maintain normal inventory.";
  }

  if (
    percentageChange <=
      -3 &&
    percentageChange >
      -10
  ) {
    return "Prioritize selling existing inventory and reduce additional purchasing.";
  }

  if (
    percentageChange <=
    -10
  ) {
    return "Minimize restocking and prioritize moving existing inventory.";
  }

  return "Maintain normal inventory.";
}