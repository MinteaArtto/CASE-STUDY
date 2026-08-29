import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

const NAV_LINKS = [
  { label: "Forecast", to: "/forecast" },
  { label: "Classifier", to: "/classifier" },
  { label: "Recommendation", to: "/recommendation" },
];

export default function Header() {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        setIsVisible(false); // Scrolling down — hide
      } else {
        setIsVisible(true); // Scrolling up — show
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <header
      className={`sticky top-0 z-50 bg-cream-light/90 backdrop-blur-sm border-b border-ink/5 transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo — replace src with your image path */}
        <Link to="/" className="flex items-center shrink-0">
          <img
            src="/mamavlogo.png" // ← Replace with your actual logo path
            alt="MAMAV"
            className="h-10 w-auto object-contain"
          />
        </Link>

        {/* Navigation links — right side */}
        <nav className="flex items-center gap-8 text-sm text-ink/80">
          {NAV_LINKS.map(({ label, to }) => (
            <Link
              key={label}
              to={to}
              className="hover:text-ink transition-colors"
            >
              {label}
            </Link>
          ))}
          <Link
            to="/about"
            className="bg-ink text-cream-light text-sm font-medium px-5 py-2 rounded-full hover:bg-ink/90 transition-colors"
          >
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}