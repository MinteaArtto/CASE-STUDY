import { Link } from "react-router-dom";
import { Leaf } from "lucide-react";

const NAV_LINKS = [
  { label: "Forecast", to: "/forecast" },
  { label: "Classifier", to: "/classifier" },
  { label: "Recommendation", to: "/recommendation" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-cream-light/90 backdrop-blur-sm border-b border-ink/5">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-display font-bold text-lg">
          <Leaf className="w-5 h-5" strokeWidth={2} />
          MAMAV
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-ink/80">
          {NAV_LINKS.map(({ label, to }) => (
            <Link key={label} to={to} className="hover:text-ink transition-colors">
              {label}
            </Link>
          ))}
        </nav>

        <Link
          to="/about"
          className="bg-ink text-cream-light text-sm font-medium px-5 py-2 rounded-full hover:bg-ink/90 transition-colors"
        >
          About
        </Link>
      </div>
    </header>
  );
}