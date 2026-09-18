import { TrendingUp, PackageCheck, BellRing } from "lucide-react";

const CARDS = [
  {
    icon: TrendingUp,

    title: "Pricing guidance",

    description:
      "Compare current and forecasted market prices to better understand possible short-term price movement.",
  },

  {
    icon: PackageCheck,

    title: "Inventory prioritization",

    description:
      "Use spoilage classification results to identify which products may require earlier selling or handling.",
  },

  {
    icon: BellRing,

    title: "Spoilage awareness",

    description:
      "Review visual spoilage results and recommendations to support more informed product decisions.",
  },
];

export default function ActionCards() {
  return (
    <section
      id="decision-support"
      className="
        bg-linear-to-b
        from-cream-light
        to-mint-light/40

        px-4
        sm:px-6

        py-16
        sm:py-20
        lg:py-24
      "
    >
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <p
            className="
              text-xs
              sm:text-sm

              font-medium

              text-teal-dark
            "
          >
            Decision support
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
            Turn analysis into useful information.
          </h2>

          <p
            className="
              mt-5

              text-base
              sm:text-lg

              text-ink/60

              leading-7
              sm:leading-8
            "
          >
            MaMaV combines price forecasts and spoilage classification results
            into clear outputs that can support day-to-day decisions involving
            selected perishable goods.
          </p>
        </div>

        <div
          className="
            grid
            sm:grid-cols-2
            lg:grid-cols-3

            gap-4
            sm:gap-5
            lg:gap-6

            mt-9
            sm:mt-12
          "
        >
          {CARDS.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="
                  group

                  rounded-2xl
                  sm:rounded-3xl

                  border
                  border-ink/10

                  bg-white/80

                  p-5
                  sm:p-6
                  lg:p-7

                  transition-all
                  duration-300

                  hover:-translate-y-1

                  hover:shadow-xl
                  hover:shadow-ink/5
                "
            >
              <div
                className="
                    w-11
                    h-11

                    sm:w-12
                    sm:h-12

                    rounded-xl
                    sm:rounded-2xl

                    bg-mint-light

                    flex
                    items-center
                    justify-center

                    text-teal-dark
                  "
              >
                <Icon className="w-5 h-5" />
              </div>

              <h3
                className="
                    mt-5
                    sm:mt-6

                    font-display
                    font-bold

                    text-lg

                    text-ink
                  "
              >
                {title}
              </h3>

              <p
                className="
                    mt-3

                    text-sm

                    text-ink/60

                    leading-6
                  "
              >
                {description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
