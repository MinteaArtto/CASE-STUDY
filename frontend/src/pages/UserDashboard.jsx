import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Moon, Sun, TrendingDown, TrendingUp } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function formatPrice(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `₱${value.toFixed(2)}`
    : "—";
}

function PriceCell({ value, direction }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="font-medium">{formatPrice(value)}</span>
      {direction === "up" && <ArrowUp className="h-4 w-4 text-red-500" aria-label="Price increase" />}
      {direction === "down" && <ArrowDown className="h-4 w-4 text-teal" aria-label="Price decrease" />}
    </div>
  );
}

export default function UserDashboard() {
  const [products, setProducts] = useState([]);
  const [priceRows, setPriceRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(
    () => document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem("mamav-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPrices() {
      try {
        const productsResponse = await fetch(`${API_BASE}/api/prices/products`, {
          signal: controller.signal,
        });
        const productsData = await productsResponse.json();

        if (!productsResponse.ok || !productsData?.success) {
          throw new Error(productsData?.message || "Unable to load products.");
        }

        const availableProducts = productsData.products || [];
        setProducts(availableProducts);

        const rows = await Promise.all(
          availableProducts.map(async (product) => {
            const seriesKey = product.series_key;
            const [forecastResponse, historyResponse] = await Promise.all([
              fetch(`${API_BASE}/api/prices/forecast`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ seriesKey }),
                signal: controller.signal,
              }),
              fetch(
                `${API_BASE}/api/prices/history?seriesKey=${encodeURIComponent(seriesKey)}`,
                { signal: controller.signal },
              ),
            ]);

            const forecastData = await forecastResponse.json();
            const historyData = await historyResponse.json();

            if (!forecastResponse.ok || !forecastData?.success) {
              throw new Error(`Forecast unavailable for ${product.commodity}`);
            }

            const history = historyData?.success ? historyData.history || [] : [];
            const currentPrice = forecastData.forecast?.current_price;
            const pastPrice = history.length > 1
              ? history[history.length - 2]?.price
              : history[history.length - 1]?.price;
            const forecasts = forecastData.forecast?.forecasts || {};

            return {
              id: seriesKey,
              commodity: product.commodity || "Unknown commodity",
              specification: product.specification,
              unit: product.unit || historyData.unit || "unit",
              currentPrice,
              pastPrice,
              week1: forecasts["1w"]?.predicted_price,
              month1: forecasts["4w"]?.predicted_price,
              currentDirection: forecasts["1w"]?.direction,
              pastDirection: currentPrice > pastPrice ? "up" : currentPrice < pastPrice ? "down" : null,
              futureDirection: forecasts["1w"]?.direction,
            };
          }),
        );

        setPriceRows(rows);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          console.error("Dashboard price fetch error", loadError);
          setError(loadError.message || "Unable to load market prices.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadPrices();
    return () => controller.abort();
  }, []);

  const totals = useMemo(() => {
    const increases = priceRows.filter((row) => row.futureDirection === "up").length;
    const decreases = priceRows.filter((row) => row.futureDirection === "down").length;
    return { increases, decreases };
  }, [priceRows]);

  return (
    <div className="min-h-screen bg-cream-light text-ink transition-colors">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm text-teal font-medium">Market dashboard</p>
            <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight mt-2">
              Price overview
            </h1>
            <p className="text-ink/65 max-w-2xl mt-3 leading-relaxed">
              Review current prices alongside recent history and upcoming
              forecasted movement for every available commodity.
            </p>
          </div>
          <button
            type="button"
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={isDarkMode}
            onClick={() => setIsDarkMode((enabled) => !enabled)}
            className="dark-mode-toggle w-11 h-11 rounded-full border border-ink/10 bg-white/70 flex items-center justify-center transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          <SummaryCard label="Tracked commodities" value={products.length} />
          <SummaryCard label="Forecasted increases" value={totals.increases} icon={<TrendingUp className="w-5 h-5 text-red-500" />} />
          <SummaryCard label="Forecasted decreases" value={totals.decreases} icon={<TrendingDown className="w-5 h-5 text-teal" />} />
        </div>

        <section className="mt-8 rounded-3xl bg-white/90 border border-ink/10 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-ink/10">
            <h2 className="font-display font-bold text-2xl">Commodity prices</h2>
            <p className="text-sm text-ink/60 mt-1">
              Scroll horizontally and vertically to explore all available price records.
            </p>
          </div>
          <div className="max-h-[30rem] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-cream-light text-ink/60">
                <tr>
                  <th className="px-6 py-4 font-medium">Commodity name</th>
                  <th className="px-6 py-4 font-medium">Unit</th>
                  <th className="px-6 py-4 font-medium">Past price</th>
                  <th className="px-6 py-4 font-medium">Current price</th>
                  <th className="px-6 py-4 font-medium">Future price (1w)</th>
                  <th className="px-6 py-4 font-medium">Future price (1m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {isLoading && (
                  <tr><td colSpan="6" className="px-6 py-12 text-center text-ink/60">Loading market prices...</td></tr>
                )}
                {!isLoading && error && (
                  <tr><td colSpan="6" className="px-6 py-12 text-center text-red-600">{error}</td></tr>
                )}
                {!isLoading && !error && priceRows.map((row) => (
                  <tr key={row.id} className="hover:bg-cream-light/70 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium">{row.commodity}</p>
                      <p className="text-xs text-ink/50 mt-1">{row.specification}</p>
                    </td>
                    <td className="px-6 py-4 text-ink/65">{row.unit}</td>
                    <td className="px-6 py-4"><PriceCell value={row.pastPrice} direction={row.pastDirection} /></td>
                    <td className="px-6 py-4"><PriceCell value={row.currentPrice} /></td>
                    <td className="px-6 py-4"><PriceCell value={row.week1} direction={row.futureDirection} /></td>
                    <td className="px-6 py-4"><PriceCell value={row.month1} direction={row.futureDirection} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function SummaryCard({ label, value, icon }) {
  return (
    <article className="rounded-2xl bg-white/90 border border-ink/10 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/60">{label}</p>
        {icon}
      </div>
      <p className="font-display font-bold text-3xl mt-4">{value}</p>
    </article>
  );
}