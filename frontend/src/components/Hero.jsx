import { Search, Mic } from "lucide-react";
import ProductCarousel from "./ProductCarousel";
import HowItWorksCard from "./HowItWorksCard";

const BRANDS = ["Logoipsum", "Logoipsum", "Logoipsum", "logoipsum"];

export default function Hero() {
  return (
    <section className="bg-linear-to-b from-cream to-cream-light">
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="font-display font-bold text-6xl md:text-8xl tracking-tight leading-none transform-[skewY(-1deg)]">
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

        <div className="mt-14 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center text-left">
          <ProductCarousel />
          <div className="flex justify-center md:justify-end">
            <HowItWorksCard />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20 text-center">
        <p className="text-sm text-ink/50 mb-6">Built with</p>
        <div className="flex flex-wrap items-center justify-center gap-10 opacity-50">
          {BRANDS.map((brand, i) => (
            <span key={i} className="font-display text-sm">
              {brand}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}