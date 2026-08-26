import { Search, Mic } from "lucide-react";
import ProductCarousel from "./ProductCarousel";
import HowItWorksCard from "./HowItWorksCard";
import { Repeat2, ShieldHalf, Grid2x2, Sparkles } from "lucide-react";

const BRANDS = [
  { icon: Repeat2, label: "" },
  { icon: ShieldHalf, label: "Logoipsum" },
  { icon: Grid2x2, label: "" },
  { icon: Sparkles, label: "Logoipsum" },
];

export default function Hero() {
  return (
    <section className="bg-linear-to-b from-cream to-cream-light">
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="font-display font-bold text-6xl md:text-8xl tracking-tight leading-none">
          MAMAV
        </h1>

        <p className="max-w-2xl mx-auto mt-8 text-ink/70 leading-relaxed">
          MamaV forecasts market prices and classifies spoilage risk for
          perishable goods, using regression and decision tree models, so
          farmers, vendors, and consumers can make sense of their next move.
        </p>

        <h2 className="font-display font-bold text-2xl mt-16 mb-6">
          today's current market trend
        </h2>

        <div className="max-w-md mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40" />
          <input
            type="text"
            placeholder="Search"
            className="w-full bg-white/70 border border-ink/10 rounded-full py-2.5 pl-11 pr-11 text-sm placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-teal/40"
          />
          <Mic className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40" />
        </div>

        <div className="mt-14 relative">
          <ProductCarousel />
          {/* DESKTOP VERSION - shows on md screens and up */}
          <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-6">
            <HowItWorksCard />
          </div>
        </div>

        {/* MOBILE VERSION - REMOVED */}
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20 text-center">
        <p className="text-sm text-ink/50 mb-6">Built with</p>
        <div className="flex flex-wrap items-center justify-center gap-10 opacity-50">
          {BRANDS.map(({ icon: Icon, label }, i) => (
            <span key={i} className="flex items-center gap-2 font-display text-sm">
              <Icon className="w-5 h-5" strokeWidth={1.75} />
              {label}
            </span>
          ))}
          <span className="border border-ink/40 rounded-full px-4 py-1 text-sm font-display">
            logoipsum
          </span>
        </div>
      </div>
    </section>
  );
}