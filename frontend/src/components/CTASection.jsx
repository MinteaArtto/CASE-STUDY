export default function CTASection() {
  return (
    <section className="bg-teal-dark px-6 py-16 text-cream-light">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="text-center md:text-left">
          <h2 className="font-display font-bold text-3xl md:text-4xl">
            See it for yourself
          </h2>
          <p className="text-cream-light/80 mt-3 max-w-md">
            Pick a product and see its price trend, forecast, and spoilage
            status in one place.
          </p>
        </div>
        <button className="bg-white text-ink text-sm font-medium px-8 py-3 rounded-full hover:bg-cream-light transition-colors shrink-0">
          VIEW
        </button>
      </div>
    </section>
  );
}