import { ArrowRight, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

// ============================================================
// STATIC GRAPH
// ============================================================

const GRAPH_POINTS = [
  { x: 20, y: 88 },
  { x: 65, y: 78 },
  { x: 110, y: 82 },
  { x: 155, y: 65 },
  { x: 200, y: 70 },
  { x: 245, y: 54 },
  { x: 290, y: 59 },
  { x: 335, y: 43 },
  { x: 380, y: 49 },
  { x: 425, y: 34 },
];

const GRAPH_PATH = GRAPH_POINTS.map(
  (point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
).join(" ");

// ============================================================
// HERO
// ============================================================

export default function Hero() {
  return (
    <section
      className="
        bg-linear-to-b
        from-cream
        to-cream-light
        overflow-hidden
      "
    >
      <div
        className="
          max-w-6xl
          mx-auto

          px-4
          sm:px-6

          pt-12
          sm:pt-14
          md:pt-16
          lg:pt-20

          pb-16
          sm:pb-18
          md:pb-20
          lg:pb-24

          grid
          lg:grid-cols-2

          gap-10
          md:gap-12
          lg:gap-16

          items-center
        "
      >
        {/* ==================================================
            LEFT SIDE
            ================================================== */}

        <div
          className="
            max-w-2xl
            lg:max-w-none
          "
        >
          <p
            className="
              inline-flex
              items-center

              rounded-full

              border
              border-teal/20

              bg-teal/5

              px-3
              sm:px-4

              py-2

              text-xs
              sm:text-sm

              font-medium

              text-teal-dark
            "
          >
            Predictive analytics for perishable goods
          </p>

          <h1
            className="
              mt-5
              sm:mt-6

              font-display
              font-bold

              text-4xl
              sm:text-5xl
              md:text-[3.5rem]
              lg:text-7xl

              tracking-tight

              leading-[1.04]

              text-ink
            "
          >
            Make better decisions with
            <span className="text-teal"> MaMaV.</span>
          </h1>

          <p
            className="
              mt-5
              sm:mt-6
              md:mt-7

              max-w-xl

              text-base
              sm:text-lg

              text-ink/65

              leading-7
              sm:leading-8
            "
          >
            MaMaV helps users understand market price trends and assess the
            visible condition of selected perishable goods through price
            forecasting and image-based spoilage classification.
          </p>

          {/* ==================================================
              CTA BUTTONS
              ================================================== */}

          <div
            className="
              mt-7
              sm:mt-8

              flex
              flex-wrap
              items-center

              gap-3
              sm:gap-4
            "
          >
            <a
              href="#price-forecasting"
              className="
                inline-flex
                items-center
                justify-center
                gap-2

                rounded-full

                bg-ink

                px-5
                sm:px-6

                py-3

                text-sm
                font-medium

                text-cream-light

                transition

                hover:bg-ink/90
              "
            >
              Explore MaMaV
              <ArrowRight className="w-4 h-4" />
            </a>

            <a
              href="/about"
              className="
                inline-flex
                items-center
                justify-center
                gap-2

                px-2
                sm:px-3

                py-3

                text-sm
                font-medium

                text-ink/70

                hover:text-teal-dark

                transition-colors
              "
            >
              Learn more
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* ==================================================
            RIGHT SIDE
            ================================================== */}

        <div
          className="
            relative
            min-w-0

            w-full

            md:max-w-2xl
            md:mx-auto

            lg:max-w-none
          "
        >
          {/* ==================================================
              BACKGROUND GLOW
              ================================================== */}

          <div
            className="
              absolute

              -top-10
              -right-10

              md:-top-14
              md:-right-14

              lg:-top-16
              lg:-right-16

              w-52
              h-52

              md:w-64
              md:h-64

              lg:w-72
              lg:h-72

              bg-mint/30

              rounded-full

              blur-3xl

              pointer-events-none
            "
          />

          {/* ==================================================
              MAIN WINDOW
              ================================================== */}

          <div
            className="
              relative

              rounded-2xl
              sm:rounded-[28px]

              border
              border-ink/10

              bg-white/90

              shadow-xl
              lg:shadow-2xl

              shadow-ink/10

              overflow-hidden
            "
          >
            {/* ==================================================
                FAKE BROWSER BAR
                ================================================== */}

            <div
              className="
                flex
                items-center

                gap-2

                border-b
                border-ink/10

                bg-cream-light

                px-4
                sm:px-5

                py-3
                sm:py-4
              "
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />

              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />

              <span className="w-2.5 h-2.5 rounded-full bg-green-400" />

              <div
                className="
                  ml-2
                  sm:ml-3

                  h-6
                  sm:h-7

                  flex-1
                  max-w-xs

                  rounded-full

                  bg-white

                  border
                  border-ink/5
                "
              />
            </div>

            {/* ==================================================
                CONTENT
                ================================================== */}

            <div
              className="
                p-4
                sm:p-6
                md:p-7
              "
            >
              {/* ==================================================
                  MOCKUP HEADER
                  ================================================== */}

              <div
                className="
                  flex
                  items-start
                  justify-between

                  gap-4
                "
              >
                <div>
                  <p
                    className="
                      text-[10px]
                      sm:text-xs

                      font-medium

                      text-teal
                    "
                  >
                    MARKET FORECAST
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
                    Tomato
                  </h3>

                  <p
                    className="
                      mt-1

                      text-[11px]
                      sm:text-xs

                      text-ink/45
                    "
                  >
                    Price trend overview
                  </p>
                </div>

                <div
                  className="
                    w-9
                    h-9

                    sm:w-10
                    sm:h-10

                    rounded-xl

                    bg-mint-light

                    flex
                    items-center
                    justify-center

                    text-teal-dark

                    shrink-0
                  "
                >
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>

              {/* ==================================================
                  GRAPH
                  ================================================== */}

              <div
                className="
                  mt-5
                  sm:mt-7

                  rounded-xl
                  sm:rounded-2xl

                  border
                  border-ink/5

                  bg-cream-light/60

                  px-3
                  sm:px-4

                  pt-4
                  sm:pt-5

                  pb-3
                "
              >
                <div
                  className="
                    flex
                    items-center
                    justify-between

                    mb-3
                  "
                >
                  <span
                    className="
                      text-[9px]
                      sm:text-[10px]

                      text-ink/40
                    "
                  >
                    Historical price
                  </span>

                  <span
                    className="
                      text-[9px]
                      sm:text-[10px]

                      text-teal-dark

                      font-medium
                    "
                  >
                    Forecast
                  </span>
                </div>

                <div
                  className="
                    relative

                    h-28
                    sm:h-36

                    md:h-40

                    w-full
                  "
                >
                  {/* GRID */}

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
                          border-t
                          border-dashed
                          border-ink/10

                          w-full
                        "
                      />
                    ))}
                  </div>

                  {/* CURRENT MARKER */}

                  <div
                    className="
                      absolute

                      left-[61%]

                      top-0
                      bottom-0

                      border-l
                      border-dashed
                      border-teal/30
                    "
                  />

                  {/* GRAPH */}

                  <svg
                    viewBox="0 0 445 110"
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
                        id="heroForecastArea"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="currentColor"
                          stopOpacity="0.18"
                        />

                        <stop
                          offset="100%"
                          stopColor="currentColor"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>

                    <path
                      d={`${GRAPH_PATH} L 425 110 L 20 110 Z`}
                      fill="url(#heroForecastArea)"
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
                        r={index === 6 ? "5" : "3.5"}
                        fill="white"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="text-teal"
                      />
                    ))}
                  </svg>

                  {/* CURRENT LABEL */}

                  <div
                    className="
                      absolute

                      left-[61%]
                      top-[42%]

                      -translate-x-1/2
                      -translate-y-full

                      rounded-lg

                      bg-ink

                      px-2
                      py-1

                      text-[8px]
                      sm:text-[9px]

                      font-medium

                      text-white

                      shadow
                    "
                  >
                    ₱70
                  </div>
                </div>

                {/* ==================================================
                    X AXIS
                    ================================================== */}

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
                  FORECAST CARDS
                  ================================================== */}

              <div
                className="
                  grid

                  grid-cols-2
                  sm:grid-cols-4

                  gap-2
                  sm:gap-3

                  mt-4
                  sm:mt-5
                "
              >
                {/* CURRENT */}

                <div
                  className="
                    rounded-xl
                    bg-cream-light

                    p-3
                  "
                >
                  <p
                    className="
                      text-[10px]
                      sm:text-[11px]

                      text-ink/45
                    "
                  >
                    Current
                  </p>

                  <p
                    className="
                      font-display
                      font-bold

                      text-base
                      sm:text-lg

                      mt-1
                    "
                  >
                    ₱70
                  </p>
                </div>

                {/* 1 WEEK */}

                <div
                  className="
                    rounded-xl

                    bg-cream-light

                    p-3
                  "
                >
                  <p
                    className="
                      text-[10px]
                      sm:text-[11px]

                      text-ink/45
                    "
                  >
                    1 Week
                  </p>

                  <p
                    className="
                      font-display
                      font-bold

                      text-base
                      sm:text-lg

                      mt-1
                    "
                  >
                    ₱73
                  </p>

                  <span
                    className="
                      mt-1

                      inline-flex
                      items-center

                      gap-1

                      text-[9px]
                      sm:text-[10px]

                      text-teal-dark
                    "
                  >
                    <TrendingUp className="w-3 h-3" />
                    Forecast
                  </span>
                </div>

                {/* 2 WEEKS */}

                <div
                  className="
                    rounded-xl

                    bg-cream-light

                    p-3
                  "
                >
                  <p
                    className="
                      text-[10px]
                      sm:text-[11px]

                      text-ink/45
                    "
                  >
                    2 Weeks
                  </p>

                  <p
                    className="
                      font-display
                      font-bold

                      text-base
                      sm:text-lg

                      mt-1
                    "
                  >
                    ₱75
                  </p>

                  <span
                    className="
                      mt-1

                      inline-flex
                      items-center

                      gap-1

                      text-[9px]
                      sm:text-[10px]

                      text-teal-dark
                    "
                  >
                    <TrendingUp className="w-3 h-3" />
                    Forecast
                  </span>
                </div>

                {/* 4 WEEKS */}

                <div
                  className="
                    rounded-xl

                    bg-cream-light

                    p-3
                  "
                >
                  <p
                    className="
                      text-[10px]
                      sm:text-[11px]

                      text-ink/45
                    "
                  >
                    4 Weeks
                  </p>

                  <p
                    className="
                      font-display
                      font-bold

                      text-base
                      sm:text-lg

                      mt-1
                    "
                  >
                    ₱68
                  </p>

                  <span
                    className="
                      mt-1

                      inline-flex
                      items-center

                      gap-1

                      text-[9px]
                      sm:text-[10px]

                      text-red-500
                    "
                  >
                    <TrendingDown className="w-3 h-3" />
                    Forecast
                  </span>
                </div>
              </div>

              {/* ==================================================
                  PREVIEW NOTE
                  ================================================== */}

              <p
                className="
                  mt-4

                  text-center

                  text-[9px]
                  sm:text-[10px]

                  text-ink/35
                "
              >
                Preview only — values shown are for interface illustration.
              </p>
            </div>
          </div>

          {/* ==================================================
              FLOATING INSIGHT

              DESKTOP ONLY
              ================================================== */}

          <div
            className="
              hidden
              lg:block

              absolute

              -bottom-8
              -left-10

              w-56

              rounded-2xl

              border
              border-ink/10

              bg-white

              p-4

              shadow-xl
            "
          >
            <p
              className="
                text-xs
                text-ink/45
              "
            >
              Forecast insight
            </p>

            <p
              className="
                mt-2

                text-sm
                font-medium

                text-ink

                leading-5
              "
            >
              Review possible market price movement before making pricing
              decisions.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
