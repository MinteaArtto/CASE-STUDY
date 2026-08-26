import { Leaf, AlertCircle } from "lucide-react";

const LINES = [-60, -35, -15, 15, 35, 60]; // rotation angles for radiating accents

export default function ClassifySection() {
  return (
    <section className="bg-linear-to-b from-cream-light via-mint-light to-mint px-6 py-24 text-center">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-display font-bold text-4xl md:text-5xl tracking-wide text-white drop-shadow-sm">
          CLASSIFY YOUR GOODS
        </h2>

        <div className="relative w-56 h-56 mx-auto mt-12 mb-14 flex items-center justify-center">
          {LINES.map((angle) => (
            <span
              key={angle}
              className="absolute left-1/2 top-1/2 w-24 h-px bg-ink/20 origin-left"
              style={{ transform: `rotate(${angle}deg)` }}
            />
          ))}
          <span className="text-8xl relative">🍅</span>
        </div>

        <h3 className="font-display font-bold text-2xl md:text-3xl leading-snug">
          How is a product's condition classified, and how is spoilage risk
          assessed?
        </h3>
        <p className="text-ink/70 mt-4 max-w-xl mx-auto leading-relaxed">
          A decision tree model reads a batch's characteristics — days since
          harvest, storage temperature, and humidity — and classifies its
          condition, so you know at a glance which products need attention
          first.
        </p>

        <div className="grid sm:grid-cols-2 gap-6 mt-12 text-left">
          <div className="bg-white/80 rounded-2xl p-6 border border-white/60">
            <div className="w-10 h-10 rounded-full border border-ink/30 flex items-center justify-center mb-4">
              <Leaf className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <h4 className="font-display font-bold text-sm tracking-wide">
              CLASSIFY CONDITION
            </h4>
            <p className="text-sm text-ink/60 mt-2 leading-relaxed">
              Reads a batch's days since harvest, storage temperature, and
              humidity to determine its current condition.
            </p>
          </div>

          <div className="bg-white/80 rounded-2xl p-6 border border-white/60">
            <div className="w-10 h-10 rounded-full border border-ink/30 flex items-center justify-center mb-4">
              <AlertCircle className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <h4 className="font-display font-bold text-sm tracking-wide">
              SPOILAGE STATUS
            </h4>
            <p className="text-sm text-ink/60 mt-2 leading-relaxed">
              Flags each batch as fresh, watch, or at risk, so you can
              prioritize what to sell first.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}