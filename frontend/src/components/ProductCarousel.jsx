import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

const PRODUCTS = [
  { name: "Avocado", image: "/products/avocado.png" },
  {
    name: "Banana",
    forecastProduct: "Banana (Saba)",
    image: "/products/banana.png",
  },
  {
    name: "Carrot",
    forecastProduct: "Carrots",
    image: "/products/carrot.png",
  },
  { name: "Tomato", image: "/products/tomato.png" },
  {
    name: "Cabbage",
    forecastProduct: "Cabbage (Rare Ball)",
    image: "/products/lettuce.png",
  },
];

export default function ProductCarousel() {
  const [prices, setPrices] = useState({});
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    slidesToScroll: 1,
    duration: 35,
  });

  const API_BASE =
    import.meta.env.VITE_API_URL || "http://localhost:5000";

  useEffect(() => {
    const controller = new AbortController();

    Promise.all(
      PRODUCTS.map(async ({ name, forecastProduct = name }) => {
        const response = await fetch(
          `${API_BASE}/api/prices/forecast?product=${encodeURIComponent(forecastProduct)}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        const weeklyForecast = data?.weekly?.oneWeek;

        if (!response.ok || !data?.success || !weeklyForecast) {
          throw new Error(`Failed to fetch forecast for ${name}`);
        }

        return [name, weeklyForecast];
      }),
    )
      .then((forecastEntries) => {
        setPrices(Object.fromEntries(forecastEntries));
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.error("Carousel price fetch error", error);
        }
      });

    return () => controller.abort();
  }, [API_BASE]);

  return (
    <div className="relative flex min-w-0 w-full items-center gap-3">
      <button
        onClick={() => emblaApi?.scrollPrev()}
        aria-label="Previous"
        className="shrink-0 p-2 rounded-full hover:bg-ink/5 transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-ink/60" />
      </button>

      <div className="min-w-0 flex-1 overflow-hidden py-4 -my-4" ref={emblaRef}>
        <div className="product-carousel-track flex gap-6 px-3">
          {PRODUCTS.map((product) => (
            (() => {
              const forecast = prices[product.name];
              const percentageChange = forecast?.percentageChange;
              const formattedChange =
                percentageChange === null || percentageChange === undefined
                  ? null
                  : `${percentageChange > 0 ? "+" : ""}${percentageChange}%`;

              return (
            <div
              key={product.name}
              tabIndex={0}
              className="product-card group min-w-0 shrink-0 min-h-64 rounded-2xl bg-cream-light/70 px-12 py-8 text-center flex flex-col items-center justify-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg focus-visible:-translate-y-2 focus-visible:shadow-lg"
            >
              <img
                src={product.image}
                alt={product.name}
                className="w-16 h-16 object-contain mb-3 transition-transform duration-200 group-hover:scale-110"
              />
              <h4 className="font-display font-bold">{product.name}</h4>
              <p className="text-lg font-bold mt-1">
                {forecast?.price !== null && forecast?.price !== undefined
                  ? `₱${Number(forecast.price).toFixed(2)}`
                  : "Loading..."}
                <span className="text-sm font-normal text-ink/50">/kg</span>
              </p>
              {formattedChange && (
                <span
                  className={
                    "text-xs mt-1 " +
                    (percentageChange >= 0 ? "text-teal" : "text-red-500")
                  }
                >
                  {formattedChange} this week
                </span>
              )}
            </div>
              );
            })()
          ))}
        </div>
      </div>

      <button
        onClick={() => emblaApi?.scrollNext()}
        aria-label="Next"
        className="shrink-0 p-2 rounded-full hover:bg-ink/5 transition-colors"
      >
        <ChevronRight className="w-5 h-5 text-ink/60" />
      </button>
    </div>
  );
}