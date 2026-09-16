import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

const PRODUCTS = [
  { name: "Avocado", image: "/products/avocado.png", commodity: "Avocado" },
  {
    name: "Banana",
    variant: "Saba",
    commodity: "Banana",
    variantMatch: "saba",
    image: "/products/banana.png",
  },
  {
    name: "Carrot",
    commodity: "Carrot",
    image: "/products/carrot.png",
  },
  { name: "Tomato", image: "/products/tomato.png", commodity: "Tomato" },
  {
    name: "Cabbage",
    variant: "Rare Ball",
    commodity: "Cabbage",
    variantMatch: "rare ball",
    image: "/products/lettuce.png",
  },
];

export default function ProductCarousel() {
  const [prices, setPrices] = useState({});
  const [carouselProducts, setCarouselProducts] = useState(PRODUCTS);
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

    async function loadPrices() {
      try {
        const productsResponse = await fetch(
          `${API_BASE}/api/prices/products`,
          { signal: controller.signal },
        );
        const productsData = await productsResponse.json();

        if (!productsResponse.ok || !productsData?.success) {
          throw new Error(productsData?.message || "Failed to retrieve carousel products.");
        }

        const availableProducts = productsData.products || [];
        const matchedProducts = PRODUCTS.map((config) => {
          const candidates = availableProducts.filter((product) => {
            const commodity = (product.commodity || "")
              .toLowerCase()
              .replace(/\s*\(.+\)/, "")
              .trim()
              .replace(/s$/, "");
            const target = config.commodity.toLowerCase();
            return commodity === target.replace(/s$/, "");
          });

          return {
            ...config,
            apiProduct: candidates.find((product) =>
              config.variantMatch
                ? `${product.commodity} ${product.specification || ""}`
                    .toLowerCase()
                    .includes(config.variantMatch)
                : true,
            ) || candidates[0],
          };
        });

        setCarouselProducts(matchedProducts);

        const forecastResults = await Promise.allSettled(
          matchedProducts
            .filter((product) => product.apiProduct?.series_key)
            .map(async (product) => {
              const seriesKey = product.apiProduct.series_key;
              const [forecastResult, historyResult] = await Promise.allSettled([
                fetch(`${API_BASE}/api/prices/forecast`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ seriesKey }),
                  signal: controller.signal,
                }).then((response) => response.json()),
                fetch(
                  `${API_BASE}/api/prices/history?seriesKey=${encodeURIComponent(seriesKey)}`,
                  { signal: controller.signal },
                ).then((response) => response.json()),
              ]);

              const forecastData = forecastResult.status === "fulfilled"
                ? forecastResult.value
                : null;
              const historyData = historyResult.status === "fulfilled"
                ? historyResult.value
                : null;
              const model = forecastData?.success ? forecastData.forecast : null;
              const prediction = model?.forecasts?.["1w"];
              const history = historyData?.success ? historyData.history || [] : [];
              const currentPrice = Number(model?.current_price ?? history.at(-1)?.price);
              const predictedPrice = Number(prediction?.predicted_price);

              if (!Number.isFinite(currentPrice)) {
                throw new Error(`No current price found for ${product.name}`);
              }

              return [
                product.name,
                {
                  price: currentPrice,
                  percentageChange: Number.isFinite(predictedPrice) &&
                    currentPrice !== 0
                    ? Number((((predictedPrice - currentPrice) / currentPrice) * 100).toFixed(2))
                    : null,
                  unit: product.apiProduct.unit || historyData?.unit || "kg",
                },
              ];
            }),
        );

        const successfulEntries = forecastResults
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);

        setPrices(Object.fromEntries(successfulEntries));
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Carousel price fetch error", error);
        }
      }
    }

    loadPrices();

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
          {carouselProducts.map((product) => (
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
              {product.variant && (
                <span className="text-xs text-ink/55 mt-0.5">
                  ({product.variant})
                </span>
              )}
              <p className="text-lg font-bold mt-1">
                {forecast?.price !== null && forecast?.price !== undefined
                  ? `₱${Number(forecast.price).toFixed(2)}`
                  : "Loading..."}
                <span className="text-sm font-normal text-ink/50">
                  /{forecast?.unit || product.apiProduct?.unit || "kg"}
                </span>
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