import { AlertCircle } from "lucide-react";

const CARDS = [
  {
    title: "Pricing guidance",
    desc: "Suggests when to hold or sell a product based on where its price is forecast to go.",
    example: "Tomato is forecast to rise 4% — consider holding 1–2 days.",
  },
  {
    title: "Inventory prioritization",
    desc: "Flags which batch to move first based on its spoilage risk, not just its age.",
    example: "Banana batch flagged AT RISK — move to front of sale line.",
  },
  {
    title: "Spoilage alerts",
    desc: "Surfaces batches classified at risk so they don't get missed in a busy inventory.",
    example: "Tomato batch classified AT RISK — markdown or sell today.",
  },
];

export default function ActionCards() {
  return (
    <section className="bg-mint px-6 py-24 text-center">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-wide">
          WHAT SHOULD YOU DO WITH THIS?
        </h2>
        <p className="text-ink/70 mt-4 max-w-xl mx-auto leading-relaxed">
          MamaV turns every price forecast and spoilage reading into a plain,
          actionable next step — so you're not just seeing numbers, you're
          seeing what to do with them.
        </p>

        <div className="grid sm:grid-cols-3 gap-6 mt-12 text-center">
          {CARDS.map(({ title, desc, example }) => (
            <div
              key={title}
              className="bg-cream-light/80 rounded-2xl p-6 border border-white/50 flex flex-col items-center"
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