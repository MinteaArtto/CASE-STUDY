import { AlertCircle } from "lucide-react";

const CARDS = [
  {
    title: "Pricing guidance",
    desc: "Use forecasted market prices to support decisions on when and how to price selected perishable goods.",
    example: "Forecast indicates a potential price increase — consider adjusting your selling strategy.",
  },
  {
    title: "Inventory prioritization",
    desc: "Identify products that may require earlier selling or prioritization based on their spoilage classification.",
    example: "Product classified as higher spoilage risk — prioritize for earlier sale or handling.",
  },
  {
    title: "Spoilage alerts",
    desc: "Highlight products identified as being at risk of spoilage so appropriate action can be considered.",
    example: "Spoilage risk detected — consider markdown, sale, or appropriate handling.",
  },
];

export default function ActionCards() {
  return (
    <section className="bg-linear-to-b from-mint to-white px-6 py-24 text-center">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-wide">
          WHAT SHOULD YOU DO NEXT?
        </h2>
        <p className="text-ink/70 mt-4 max-w-xl mx-auto leading-relaxed">
          MamaV translates forecasting and spoilage-classification results
          into actionable decision-support outputs.
        </p>

        <div className="grid sm:grid-cols-3 gap-6 mt-12 text-center">
          {CARDS.map(({ title, desc, example }) => (
            <div
              key={title}
              className="bg-white/90 rounded-2xl p-6 border border-white/50 flex flex-col items-center"
            >
              <div className="w-10 h-10 rounded-full border border-ink/30 flex items-center justify-center mb-4">
                <AlertCircle className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <h3 className="font-display font-bold text-sm">{title}</h3>
              <p className="text-sm text-ink/60 mt-2 leading-relaxed">
                {desc}
              </p>
              <p className="text-xs text-ink/50 mt-4 pt-4 border-t border-ink/10 w-full">
                {example}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
