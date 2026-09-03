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
    <div className="relative flex items-center gap-3">
      <button
        onClick={() => emblaApi?.scrollPrev()}
        aria-label="Previous"
        className="shrink-0 p-2 rounded-full hover:bg-ink/5 transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-ink/60" />
      </button>

      <div className="overflow-hidden flex-1" ref={emblaRef}>
        <div className="flex gap-4">
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
              className="flex-[0_0_calc(33.333%-11px)] min-w-0 bg-cream-light/70 rounded-2xl p-6 text-center flex flex-col items-center"
            >
              <img
                src={product.image}
                alt={product.name}
                className="w-16 h-16 object-contain mb-3"
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