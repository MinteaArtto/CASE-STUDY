export default function CTASection() {
  return (
    <section className="bg-teal-dark text-cream-light">
      <div className="flex items-center gap-2 px-6 py-3 bg-black/15">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-col md:flex-row items-start justify-between gap-8">
          <div className="text-left">
            <h2 className="font-display font-bold text-3xl md:text-4xl">
              FORECAST THE MARKET
            </h2>
            <p className="text-cream-light/80 mt-3 max-w-md">
              Select a perishable good to view its historical market prices
              and generated price forecast based on the available dataset.
            </p>
          </div>
          <button className="bg-white text-ink text-sm font-medium px-8 py-3 rounded-full hover:bg-cream-light transition-colors shrink-0">
            VIEW
          </button>
        </div>
      </div>
    </section>
  );
}
