import { ArrowRight, LineChart, ScanSearch } from "lucide-react";

export default function CTASection() {
  return (
    <section
      className="
        bg-teal-dark

        px-4
        sm:px-6

        py-16
        sm:py-20
        lg:py-24

        text-cream-light
      "
    >
      <div
        className="
          max-w-6xl
          mx-auto

          grid
          lg:grid-cols-[1fr_auto]

          gap-8
          sm:gap-10
          lg:gap-12

          items-center
        "
      >
        <div>
          <p
            className="
              text-xs
              sm:text-sm

              font-medium

              text-mint
            "
          >
            Explore MaMaV
          </p>

          <h2
            className="
              mt-3

              max-w-2xl

              font-display
              font-bold

              text-3xl
              sm:text-4xl
              md:text-5xl

              leading-tight
            "
          >
            Forecast prices. Assess product condition. Make more informed
            decisions.
          </h2>

          <p
            className="
              mt-5

              max-w-2xl

              text-base
              sm:text-lg

              text-cream-light/70

              leading-7
              sm:leading-8
            "
          >
            Use MaMaV's forecasting and spoilage-classification features to
            explore market information and evaluate selected perishable goods.
          </p>

          <div
            className="
              mt-7
              sm:mt-8

              flex
              flex-col
              sm:flex-row
              sm:flex-wrap

              gap-3
              sm:gap-5

              text-sm

              text-cream-light/80
            "
          >
            <span
              className="
                inline-flex
                items-center

                gap-2
              "
            >
              <LineChart className="w-4 h-4 text-mint shrink-0" />
              Price forecasting
            </span>

            <span
              className="
                inline-flex
                items-center

                gap-2
              "
            >
              <ScanSearch className="w-4 h-4 text-mint shrink-0" />
              Spoilage classification
            </span>
          </div>
        </div>

        <a
          href="#price-forecasting"
          className="
            inline-flex
            items-center
            justify-center

            gap-2

            rounded-full

            bg-white

            px-6
            sm:px-7

            py-3.5

            text-sm
            font-medium

            text-ink

            hover:bg-cream-light

            transition-colors

            whitespace-nowrap

            w-full
            sm:w-auto
            lg:w-auto
          "
        >
          Explore features
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </section>
  );
}
