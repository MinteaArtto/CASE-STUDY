import React, {
  useState,
  useEffect,
  useRef,
} from "react";

import Header from "../components/Header";
import Footer from "../components/Footer";

/* ============================================================
   CHART
   ============================================================ */

function SimpleLineChart({
  data = [],
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
     
     Historical = approximately 70%
     Forecast   = approximately 30%

     This gives the future points enough horizontal room.
     ========================================================== */

  const historicalWidth =
    plotWidth * 0.70;

  const forecastWidth =
    plotWidth -
    historicalWidth;

  const historicalStep =
    currentIndex > 0
      ? historicalWidth /
        currentIndex
      : 0;

  const forecastStep =
    futureCount > 0
      ? forecastWidth /
        futureCount
      : 0;

  const computeX = (
    index
  ) => {
    /*
     * Historical data.
     */
    if (
      index <= currentIndex
    ) {
      return (
        plotLeft +
        index *
          historicalStep
      );
    }

    /*
     * Forecast data.

     * +1w = first forecast position
     * +2w = second
     * +3w = third
     * +4w = fourth
     */
    const futureNumber =
      index -
      currentIndex;

    return (
      plotLeft +
      historicalWidth +
      futureNumber *
        forecastStep
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

  const computeY = (
    index
  ) => {
    const value =
      Number(
        data[index].y
      ) || 0;

    return (
      chartBottom -
      ((value - min) /
        range) *
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
     
     Historical:
       every 4 weeks

     Forecast:
       every forecast week

     Current:
       always included
     ========================================================== */

  const gridIndices =
    new Set();

  /*
   * Historical grid every 4 weeks.
   */
  for (
    let index = 0;
    index <= currentIndex;
    index += 4
  ) {
    gridIndices.add(
      index
    );
  }

  /*
   * Always show first historical point.
   */
  gridIndices.add(0);

  /*
   * Always show Current.
   */
  gridIndices.add(
    currentIndex
  );

  /*
   * Forecast points each get their own vertical grid line.
   */
  data.forEach(
    (item, index) => {
      if (
        item.future
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
      const difference =
        index -
        currentIndex;

      if (
        difference ===
        0
      ) {
        return "Current";
      }

      if (
        difference < 0
      ) {
        return `${difference}w`;
      }

      return `+${difference}w`;
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
      className="w-full h-[360px]"
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
            const difference =
              hoverIdx -
              currentIndex;

            label =
              difference < 0
                ? `${difference}w`
                : `+${difference}w`;
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
                per kg
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
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState(null);

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

          if (
            availableProducts.length >
            0
          ) {
            setSelectedProduct(
              availableProducts[
                0
              ].product
            );
          }
        }
      })
      .catch((err) => {
        console.error(
          "Products fetch error",
          err
        );
      });
  }, [API_BASE]);

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

    const forecastPromise =
      fetch(
        `${API_BASE}/api/prices/forecast?product=${encodeURIComponent(
          selectedProduct
        )}`
      ).then(
        (response) =>
          response.json()
      );

    const historyPromise =
      fetch(
        `${API_BASE}/api/prices/history?product=${encodeURIComponent(
          selectedProduct
        )}&type=weekly`
      ).then(
        (response) =>
          response.json()
      );

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
            setForecast(
              forecastData
            );
          }

          if (
            !historyData ||
            !historyData.success
          ) {
            setHistory([]);
          } else {
            setHistory(
              historyData.history ||
                []
            );
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

  /* ==========================================================
     HISTORICAL DATA
     ========================================================== */

  const chartData =
    history.map(
      (row, index) => ({
        x: index,
        y:
          Number(
            row.price
          ) || 0,
        date: row.date,
        future: false,
      })
    );

  let chartWithFuture =
    chartData.length
      ? [...chartData]
      : [];

  /* ==========================================================
     FORECAST DATA
     
     +1w = actual weekly prediction
     +2w = interpolation
     +3w = interpolation
     +4w = actual monthly prediction
     ========================================================== */

  const oneWeekPrice =
    forecast?.weekly
      ?.oneWeek?.price ??
    null;

  const oneMonthPrice =
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

    if (
      oneWeekPrice !==
        null &&
      oneMonthPrice !==
        null
    ) {
      const startPrice =
        Number(
          oneWeekPrice
        );

      const endPrice =
        Number(
          oneMonthPrice
        );

      /*
       * Interpolate the middle two weeks.
       */

      const week2 =
        startPrice +
        (endPrice -
          startPrice) *
          (1 / 3);

      const week3 =
        startPrice +
        (endPrice -
          startPrice) *
          (2 / 3);

      const startingIndex =
        chartWithFuture.length;

      /*
       * +1w
       */
      chartWithFuture.push({
        x: startingIndex,
        y: startPrice,
        date: "+1w",
        future: true,
        forecastWeek: 1,
      });

      /*
       * +2w
       */
      chartWithFuture.push({
        x:
          startingIndex +
          1,
        y: week2,
        date: "+2w",
        future: true,
        forecastWeek: 2,
      });

      /*
       * +3w
       */
      chartWithFuture.push({
        x:
          startingIndex +
          2,
        y: week3,
        date: "+3w",
        future: true,
        forecastWeek: 3,
      });

      /*
       * +4w
       */
      chartWithFuture.push({
        x:
          startingIndex +
          3,
        y: endPrice,
        date: "+4w",
        future: true,
        forecastWeek: 4,
      });
    }

    /* ========================================================
       ONLY WEEKLY FORECAST AVAILABLE
       ======================================================== */

    else if (
      oneWeekPrice !==
      null
    ) {
      chartWithFuture.push({
        x:
          chartWithFuture.length,
        y: Number(
          oneWeekPrice
        ),
        date: "+1w",
        future: true,
        forecastWeek: 1,
      });
    }

    /* ========================================================
       ONLY MONTHLY FORECAST AVAILABLE
       ======================================================== */

    else if (
      oneMonthPrice !==
      null
    ) {
      chartWithFuture.push({
        x:
          chartWithFuture.length,
        y: Number(
          oneMonthPrice
        ),
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

          <div className="max-w-md w-full">
            <select
              value={
                selectedProduct ||
                ""
              }
              onChange={(event) =>
                setSelectedProduct(
                  event.target.value
                )
              }
              className="w-full bg-white/80 border border-ink/10 rounded-full py-3 px-4 text-sm"
            >
              {products.map(
                (product) => (
                  <option
                    key={
                      product.product
                    }
                    value={
                      product.product
                    }
                  >
                    {
                      product.product
                    }
                  </option>
                )
              )}
            </select>
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
              src={getProductImage(
                selectedProduct
              )}
              onError={(event) => {
                event.currentTarget.onerror =
                  null;

                event.currentTarget.src =
                  "/products/fruit.png";
              }}
              alt={
                selectedProduct ||
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
                  per kg
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
                  per kg
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
                      per kg
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