import { ArrowRight, CheckCircle2, Image, ScanSearch } from "lucide-react";

export default function ClassifySection() {
  return (
    <section
      id="spoilage-classification"
      className="
        bg-cream-light

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
            MOCKUP
            ================================================== */}

        <div className="relative order-2 lg:order-1 min-w-0">
          <div
            className="
              absolute

              -left-12
              sm:-left-16

              top-12

              w-52
              h-52

              sm:w-72
              sm:h-72

              rounded-full

              bg-mint/30

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

              bg-white

              shadow-xl
              sm:shadow-2xl

              shadow-ink/10

              overflow-hidden
            "
          >
            {/* BROWSER HEADER */}

            <div
              className="
                flex
                items-center

                gap-2

                px-4
                sm:px-5

                py-3
                sm:py-4

                border-b
                border-ink/10

                bg-cream-light
              "
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />

              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />

              <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>

            <div
              className="
                p-4
                sm:p-6
                md:p-8
              "
            >
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-teal">
                  SPOILAGE CLASSIFICATION
                </p>

                <h3
                  className="
                    mt-1

                    font-display
                    font-bold

                    text-lg
                    sm:text-xl
                  "
                >
                  Product analysis
                </h3>
              </div>

              <div
                className="
                  mt-5
                  sm:mt-6

                  grid
                  sm:grid-cols-[0.9fr_1.1fr]

                  gap-4
                  sm:gap-5
                "
              >
                {/* IMAGE PREVIEW */}

                <div
                  className="
                    min-h-44
                    sm:min-h-56

                    rounded-xl
                    sm:rounded-2xl

                    bg-linear-to-br
                    from-mint-light
                    to-cream

                    border
                    border-ink/5

                    flex
                    items-center
                    justify-center

                    p-4
                    sm:p-5
                  "
                >
                  <div className="text-center">
                    <div
                      className="
                        mx-auto

                        w-16
                        h-16

                        sm:w-20
                        sm:h-20

                        rounded-2xl

                        bg-white

                        shadow-sm

                        flex
                        items-center
                        justify-center
                      "
                    >
                      <Image className="w-7 h-7 sm:w-9 sm:h-9 text-teal" />
                    </div>

                    <p
                      className="
                        mt-4

                        text-[10px]
                        sm:text-xs

                        text-ink/45
                      "
                    >
                      Product image preview
                    </p>
                  </div>
                </div>

                {/* RESULT */}

                <div
                  className="
                    rounded-xl
                    sm:rounded-2xl

                    border
                    border-ink/10

                    p-4
                    sm:p-5
                  "
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] sm:text-xs text-ink/45">
                      Classification
                    </span>

                    <ScanSearch className="w-4 h-4 text-teal shrink-0" />
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-teal" />

                    <p
                      className="
                        font-display
                        font-bold

                        text-xl
                        sm:text-2xl

                        text-teal-dark
                      "
                    >
                      Fresh
                    </p>
                  </div>

                  <div className="mt-5">
                    <div
                      className="
                        flex
                        items-center
                        justify-between

                        gap-3

                        text-[10px]
                        sm:text-xs
                      "
                    >
                      <span className="text-ink/45">
                        Decision Tree confidence
                      </span>

                      <span className="font-medium text-ink">96%</span>
                    </div>

                    <div
                      className="
                        mt-2

                        h-2

                        rounded-full

                        bg-ink/5

                        overflow-hidden
                      "
                    >
                      <div className="w-[96%] h-full bg-teal rounded-full" />
                    </div>
                  </div>

                  <div
                    className="
                      mt-5

                      rounded-xl

                      bg-cream-light

                      p-3
                      sm:p-4
                    "
                  >
                    <p className="text-[10px] sm:text-[11px] text-ink/45">
                      Recommendation
                    </p>

                    <p
                      className="
                        text-[11px]
                        sm:text-xs

                        text-ink/70

                        mt-1

                        leading-5
                      "
                    >
                      Product appears visually fresh based on the submitted
                      image.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================
            EXPLANATION
            ================================================== */}

        <div className="order-1 lg:order-2">
          <p className="text-xs sm:text-sm font-medium text-teal-dark">
            Spoilage Classification
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
            Assess the visible condition of your produce.
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
            MaMaV analyzes a submitted image of a selected fruit or vegetable
            and uses visual features to classify its condition as Fresh or
            Rotten.
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
            When a product is classified as Rotten, the system can also identify
            visible spoilage indicators and provide a corresponding
            recommendation to help users decide what to do next.
          </p>

          <a
            href="#decision-support"
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
            See how results are used
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
