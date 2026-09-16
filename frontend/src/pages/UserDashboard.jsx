import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import UserLogIn from "./UserLogIn";
import UserSignUp from "./UserSignUp";
import UserForgotPassword from "./UserForgotPassword";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function formatPrice(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `₱${number.toFixed(2)}`
    : "—";
}

function getPercentageChange(current, projected) {
  const currentValue = Number(current);
  const projectedValue = Number(projected);

  if (!Number.isFinite(currentValue) || !Number.isFinite(projectedValue) || currentValue === 0) {
    return null;
  }

  return Number((((projectedValue - currentValue) / currentValue) * 100).toFixed(2));
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

function ChangeCell({ percentage }) {
  if (percentage === null || percentage === undefined) {
    return <span className="text-ink/45">—</span>;
  }

  const isIncrease = percentage > 0;
  const isDecrease = percentage < 0;

  return (
    <div className={`flex items-center gap-1 whitespace-nowrap font-medium ${
      isIncrease ? "text-red-500" : isDecrease ? "text-teal" : "text-ink/60"
    }`}>
      {isIncrease && <ArrowUp className="h-4 w-4" aria-hidden="true" />}
      {isDecrease && <ArrowDown className="h-4 w-4" aria-hidden="true" />}
      {percentage > 0 ? "+" : ""}{percentage.toFixed(2)}%
    </div>
  );
}

export default function UserDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    const stored = window.localStorage.getItem("mamav-user");
    return stored ? JSON.parse(stored) : null;
  });
  const [authView, setAuthView] = useState(() => (user ? null : "signup"));
  const [products, setProducts] = useState([]);
  const [priceRows, setPriceRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const rowsPerPage = 10;

  useEffect(() => {
    const handleAuthChange = () => {
      const stored = window.localStorage.getItem("mamav-user");
      setUser(stored ? JSON.parse(stored) : null);
      if (!stored) setAuthView("signup");
    };

    window.addEventListener("mamav-auth-change", handleAuthChange);
    return () => window.removeEventListener("mamav-auth-change", handleAuthChange);
  }, []);
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return undefined;
    }

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

        const rows = (await Promise.all(
          availableProducts.map(async (product) => {
            const seriesKey = product.series_key;
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

            const history = historyData?.success ? historyData.history || [] : [];
            const forecast = forecastData?.success ? forecastData.forecast : null;
            const currentPrice = forecast?.current_price ?? history.at(-1)?.price;
            const forecasts = forecast?.forecasts || {};

            if (currentPrice === undefined && history.length === 0) {
              return null;
            }

            return {
              id: seriesKey,
              commodity: product.commodity || "Unknown commodity",
              category: product.category || historyData.category || "Uncategorized",
              specification: product.specification,
              unit: product.unit || historyData.unit || "unit",
              currentPrice,
              week1: forecasts["1w"]?.predicted_price,
              week2: forecasts["2w"]?.predicted_price,
              week4: forecasts["4w"]?.predicted_price,
              projectedChange: getPercentageChange(
                currentPrice,
                forecasts["1w"]?.predicted_price,
              ),
            };
          }),
        )).filter(Boolean);

        setPriceRows(rows);
        setCurrentPage(1);
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
  }, [user]);

  const categories = [...new Set(priceRows.map((row) => row.category).filter(Boolean))].sort();
  const filteredRows = categoryFilter === "all"
    ? priceRows
    : priceRows.filter((row) => row.category === categoryFilter);
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );
  const filteredPageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));

  useEffect(() => {
    if (currentPage > filteredPageCount) setCurrentPage(filteredPageCount);
  }, [currentPage, filteredPageCount]);

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
        </div>

        <div className="grid sm:grid-cols-1 max-w-sm gap-4 mt-10">
          <SummaryCard label="Tracked commodities" value={products.length} />
        </div>

        <section className="mt-8 rounded-3xl bg-white/90 border border-ink/10 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-ink/10">
            <h2 className="font-display font-bold text-2xl">Commodity prices</h2>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-ink/60">
                Select a commodity to open its full forecast.
              </p>
              <label className="flex items-center gap-2 text-sm text-ink/65">
                Category
                <select
                  value={categoryFilter}
                  onChange={(event) => {
                    setCategoryFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-full border border-ink/15 bg-white/80 px-4 py-2 text-ink outline-none focus:ring-2 focus:ring-teal/40 dark:bg-ink/40"
                  aria-label="Filter dashboard by category"
                >
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="max-h-[30rem] overflow-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-cream-light text-ink/60">
                <tr>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium">Commodity name</th>
                  <th className="px-6 py-4 font-medium">Unit</th>
                  <th className="current-price-header px-6 py-4 font-medium">
                    Current price
                  </th>
                  <th className="px-6 py-4 font-medium">Future price (1w)</th>
                  <th className="px-6 py-4 font-medium">Future price (2w)</th>
                  <th className="px-6 py-4 font-medium">Future price (4w)</th>
                  <th className="px-6 py-4 font-medium">Change (1w)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {isLoading && (
                  <tr><td colSpan="8" className="px-6 py-12 text-center text-ink/60">Loading market prices...</td></tr>
                )}
                {!isLoading && error && (
                  <tr><td colSpan="8" className="px-6 py-12 text-center text-red-600">{error}</td></tr>
                )}
                {!isLoading && !error && visibleRows.map((row) => (
                  <tr key={row.id} className="dashboard-price-row transition-colors">
                    <td className="px-6 py-4 text-ink/70">{row.category}</td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/forecast?seriesKey=${encodeURIComponent(row.id)}`}
                        className="dashboard-commodity-link block transition-colors"
                      >
                      <p className="font-medium">{row.commodity}</p>
                      <p className="text-xs text-ink/50 mt-1">{row.specification}</p>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-ink/65">{row.unit}</td>
                    <td className="current-price-cell px-6 py-4">
                      <PriceCell value={row.currentPrice} />
                    </td>
                    <td className="px-6 py-4"><PriceCell value={row.week1} /></td>
                    <td className="px-6 py-4"><PriceCell value={row.week2} /></td>
                    <td className="px-6 py-4"><PriceCell value={row.week4} /></td>
                    <td className="px-6 py-4"><ChangeCell percentage={row.projectedChange} /></td>
                  </tr>
                ))}
                {!isLoading && !error && !visibleRows.length && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-ink/60">
                      No commodity prices are available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && !error && filteredRows.length > 0 && (
            <div className="flex items-center justify-between gap-4 border-t border-ink/10 px-6 py-4 text-sm">
              <span className="text-ink/60">
                Showing {(currentPage - 1) * rowsPerPage + 1}-
                {Math.min(currentPage * rowsPerPage, filteredRows.length)} of {filteredRows.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="rounded-full border border-ink/15 px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cream-light transition-colors"
                >
                  Previous
                </button>
                <span className="px-2 text-ink/60">
                  Page {currentPage} of {filteredPageCount}
                </span>
                <button
                  type="button"
                  disabled={currentPage === filteredPageCount}
                  onClick={() => setCurrentPage((page) => Math.min(filteredPageCount, page + 1))}
                  className="rounded-full border border-ink/15 px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cream-light transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
      <Footer />
      {authView === "signup" && (
        <UserSignUp
          onClose={() => navigate("/")}
          onLogIn={() => setAuthView("login")}
          onComplete={(profile) => {
            window.localStorage.setItem("mamav-user", JSON.stringify(profile));
            window.dispatchEvent(new Event("mamav-auth-change"));
            setUser(profile);
            setAuthView(null);
          }}
        />
      )}
      {authView === "login" && (
        <UserLogIn
          onClose={() => navigate("/")}
          onSignUp={() => setAuthView("signup")}
          onForgotPassword={() => setAuthView("forgot-password")}
          onComplete={(profile) => {
            window.localStorage.setItem("mamav-user", JSON.stringify(profile));
            window.dispatchEvent(new Event("mamav-auth-change"));
            setUser(profile);
            setAuthView(null);
          }}
        />
      )}
      {authView === "forgot-password" && (
        <UserForgotPassword
          onClose={() => navigate("/")}
          onLogIn={() => setAuthView("login")}
        />
      )}
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