import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

// ============================================================
// STATIC PREVIEW DATA
// ============================================================

const MOCK_ROWS = [
  {
    commodity: "Tomato",
    current: "₱70",
    week1: "₱73",
    week2: "₱75",
    week4: "₱68",
    trend: "down",
  },
  {
    commodity: "Cabbage",
    current: "₱82",
    week1: "₱80",
    week2: "₱79",
    week4: "₱77",
    trend: "down",
  },
  {
    commodity: "White Potato",
    current: "₱95",
    week1: "₱97",
    week2: "₱99",
    week4: "₱101",
    trend: "up",
  },
];

// ============================================================
// STATIC GRAPH
// ============================================================

const GRAPH_POINTS = [
  { x: 15, y: 82 },
  { x: 55, y: 72 },
  { x: 95, y: 77 },
  { x: 135, y: 61 },
  { x: 175, y: 66 },
  { x: 215, y: 52 },
  { x: 255, y: 57 },
  { x: 295, y: 43 },
  { x: 335, y: 48 },
  { x: 375, y: 38 },
];

const GRAPH_PATH = GRAPH_POINTS.map(
  (point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
).join(" ");

// ============================================================
// FORECAST SECTION
// ============================================================

export default function ForecastSection() {
  return (
    <section
      id="price-forecasting"
      className="
        bg-white

        px-4
        sm:px-6

        py-16
        sm:py-20
        lg:py-24

        overflow-hidden
      "
    >
      <div
        className="
          max-w-6xl
          mx-auto

          grid
          lg:grid-cols-2

          gap-10
          sm:gap-12
          lg:gap-16

          items-center
        "
      >
        {/* ==================================================
            EXPLANATION
            ================================================== */}

        <div>
          <p
            className="
              text-xs
              sm:text-sm

              font-medium

              text-teal-dark
            "
          >
            Market Price Forecasting
          </p>

          <h2
            className="
              mt-3

              font-display
              font-bold

              text-3xl
              sm:text-4xl
              md:text-5xl

              tracking-tight
              leading-tight

              text-ink
            "
          >
            Understand possible short-term price movements.
          </h2>

          <p
            className="
              mt-5
              sm:mt-6

              text-base
              sm:text-lg

              text-ink/65

              leading-7
              sm:leading-8
            "
          >
            MaMaV uses historical weekly market-price data to generate forecasts
            for selected perishable goods. Users can compare the current market
            price with projected prices one, two, and four weeks ahead.
          </p>

          <p
            className="
              mt-4

              text-sm
              sm:text-base

              text-ink/55

              leading-6
              sm:leading-7
            "
          >
            These forecasts are intended to provide additional information that
            can support pricing and inventory decisions while showing the
            historical context behind each commodity series.
          </p>

          <a
            href="#spoilage-classification"
            className="
              mt-6
              sm:mt-7

              inline-flex
              items-center
              gap-2

              text-sm
              font-medium

              text-teal-dark

              hover:gap-3

              transition-all
            "
          >
            Explore spoilage classification
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* ==================================================
            PREVIEW
            ================================================== */}

        <div className="relative min-w-0">
          <div
            className="
              absolute

              -right-12
              sm:-right-20

              top-10

              w-52
              h-52

              sm:w-72
              sm:h-72

              bg-mint/25

              rounded-full

              blur-3xl

              pointer-events-none
            "
          />

          <div
            className="
              relative

              rounded-2xl
              sm:rounded-[28px]

              border
              border-ink/10

              bg-cream-light

              p-4
              sm:p-6
              md:p-7

              shadow-xl
              shadow-ink/5

              overflow-hidden
            "
          >
            {/* ==================================================
                HEADER
                ================================================== */}

            <div
              className="
                flex
                items-start
                justify-between

                gap-3
                sm:gap-4
              "
            >
              <div className="min-w-0">
                <p
                  className="
                    text-[10px]
                    sm:text-xs

                    font-medium

                    text-teal
                  "
                >
                  FORECAST PREVIEW
                </p>

                <h3
                  className="
                    mt-1

                    font-display
                    font-bold

                    text-lg
                    sm:text-xl

                    text-ink
                  "
                >
                  Selected commodities
                </h3>

                <p
                  className="
                    mt-1

                    text-[11px]
                    sm:text-xs

                    text-ink/45
                  "
                >
                  Historical trend and short-term forecast
                </p>
              </div>

              <span
                className="
                  rounded-full

                  bg-white

                  px-2.5
                  sm:px-3

                  py-1.5

                  text-[9px]
                  sm:text-[10px]

                  font-medium

                  text-ink/45

                  border
                  border-ink/5

                  shrink-0
                "
              >
                Preview
              </span>
            </div>

            {/* ==================================================
                GRAPH
                ================================================== */}

            <div
              className="
                mt-5
                sm:mt-6

                rounded-xl
                sm:rounded-2xl

                border
                border-ink/5

                bg-white

                p-4
                sm:p-5
              "
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
                      text-[10px]
                      sm:text-xs

                      text-ink/45
                    "
                  >
                    Tomato
                  </p>

                  <p
                    className="
                      mt-1

                      font-display
                      font-bold

                      text-xl
                      sm:text-2xl

                      text-ink
                    "
                  >
                    ₱70/kg
                  </p>
                </div>

                <span
                  className="
                    inline-flex
                    items-center
                    gap-1

                    rounded-full

                    bg-mint-light

                    px-2.5
                    sm:px-3

                    py-1.5

                    text-[9px]
                    sm:text-[10px]

                    font-medium

                    text-teal-dark

                    shrink-0
                  "
                >
                  <TrendingUp className="w-3 h-3" />
                  Short-term trend
                </span>
              </div>

              <div
                className="
                  relative

                  mt-4
                  sm:mt-5

                  h-28
                  sm:h-32

                  w-full
                "
              >
                <div
                  className="
                    absolute
                    inset-0

                    flex
                    flex-col
                    justify-between

                    pointer-events-none
                  "
                >
                  {[0, 1, 2, 3].map((line) => (
                    <div
                      key={line}
                      className="
                        w-full

                        border-t
                        border-dashed
                        border-ink/10
                      "
                    />
                  ))}
                </div>

                <div
                  className="
                    absolute

                    left-[62%]

                    top-0
                    bottom-0

                    border-l
                    border-dashed
                    border-teal/25
                  "
                />

                <svg
                  viewBox="0 0 390 105"
                  preserveAspectRatio="none"
                  className="
                    absolute
                    inset-0

                    w-full
                    h-full

                    overflow-visible
                  "
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient
                      id="forecastSectionArea"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.16"
                      />

                      <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>

                  <path
                    d={`${GRAPH_PATH} L 375 105 L 15 105 Z`}
                    fill="url(#forecastSectionArea)"
                    className="text-teal"
                  />

                  <path
                    d={GRAPH_PATH}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-teal"
                  />

                  {GRAPH_POINTS.map((point, index) => (
                    <circle
                      key={index}
                      cx={point.x}
                      cy={point.y}
                      r="3.5"
                      fill="white"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-teal"
                    />
                  ))}
                </svg>

                <div
                  className="
                    absolute

                    left-[62%]
                    top-[44%]

                    -translate-x-1/2
                    -translate-y-full

                    rounded-md

                    bg-ink

                    px-2
                    py-1

                    text-[8px]
                    sm:text-[9px]

                    text-white

                    shadow
                  "
                >
                  ₱70
                </div>
              </div>

              <div
                className="
                  mt-2

                  grid
                  grid-cols-4

                  text-[8px]
                  sm:text-[9px]

                  text-ink/35
                "
              >
                <span>History</span>

                <span className="text-center">Current</span>

                <span className="text-center">+2W</span>

                <span className="text-right">+4W</span>
              </div>
            </div>

            {/* ==================================================
                RESPONSIVE PREVIEW TABLE
                NO SCROLLBAR
                ================================================== */}

            <div
              className="
                mt-4
                sm:mt-5

                rounded-xl
                sm:rounded-2xl

                bg-white

                border
                border-ink/5

                overflow-hidden
              "
            >
              {/* HEADER */}

              <div
                className="
                  grid
                  grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,0.75fr))]

                  gap-1
                  sm:gap-2

                  px-3
                  sm:px-4

                  py-3

                  text-[8px]
                  sm:text-[10px]

                  font-medium

                  text-ink/40

                  border-b
                  border-ink/5
                "
              >
                <span className="truncate">Commodity</span>

                <span className="text-center">Current</span>

                <span className="text-center">1W</span>

                <span className="text-center">2W</span>

                <span className="text-center">4W</span>
              </div>

              {/* ROWS */}

              {MOCK_ROWS.map((row) => (
                <div
                  key={row.commodity}
                  className="
                    grid
                    grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,0.75fr))]

                    gap-1
                    sm:gap-2

                    px-3
                    sm:px-4

                    py-3
                    sm:py-3.5

                    text-[10px]
                    sm:text-xs

                    border-b
                    border-ink/5

                    last:border-b-0

                    items-center
                  "
                >
                  <span
                    className="
                      font-medium
                      text-ink

                      truncate
                    "
                  >
                    {row.commodity}
                  </span>

                  <span
                    className="
                      text-center
                      text-ink/65
                    "
                  >
                    {row.current}
                  </span>

                  <span
                    className="
                      text-center
                      text-ink/65
                    "
                  >
                    {row.week1}
                  </span>

                  <span
                    className="
                      text-center
                      text-ink/65
                    "
                  >
                    {row.week2}
                  </span>

                  <span
                    className="
                      flex
                      items-center
                      justify-center

                      gap-0.5

                      text-ink/65
                    "
                  >
                    {row.week4}

                    {row.trend === "up" ? (
                      <TrendingUp
                        className="
                          w-2.5
                          h-2.5

                          sm:w-3
                          sm:h-3

                          text-teal-dark

                          shrink-0
                        "
                      />
                    ) : (
                      <TrendingDown
                        className="
                          w-2.5
                          h-2.5

                          sm:w-3
                          sm:h-3

                          text-red-500

                          shrink-0
                        "
                      />
                    )}
                  </span>
                </div>
              ))}
            </div>

            <p
              className="
                mt-4

                text-[9px]
                sm:text-[10px]

                text-ink/35

                text-center
              "
            >
              Preview only — values shown are for interface illustration.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
