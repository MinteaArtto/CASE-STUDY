export default function HowItWorksCard() {
  return (
    <div
      className="
        w-full
        max-w-sm

        rounded-2xl

        overflow-hidden

        border
        border-ink/10

        shadow-sm

        bg-white
      "
    >
      {/* ==================================================
          FAKE BROWSER CHROME
          ================================================== */}

      <div
        className="
          flex
          items-center

          gap-2

          bg-ink

          px-4
          py-3
        "
      >
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />

        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />

        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
      </div>

      {/* ==================================================
          CONTENT
          ================================================== */}

      <div
        className="
          p-5
          sm:p-6
        "
      >
        <p
          className="
            text-sm

            text-ink/70

            leading-relaxed
          "
        >
          MaMaV uses available historical market data to identify pricing
          patterns and generate forecasts for selected perishable goods.
        </p>

        <button
          type="button"
          className="
            mt-5

            bg-ink

            text-cream-light

            text-sm

            px-6
            py-2.5

            rounded-full

            hover:bg-ink/90

            transition-colors
          "
        >
          VIEW
        </button>
      </div>
    </div>
  );
}
