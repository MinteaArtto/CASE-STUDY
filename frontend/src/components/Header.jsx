import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Moon, Sun, UserRound } from "lucide-react";
import User from "../pages/User";
import UserLogIn from "../pages/UserLogIn";
import UserSignUp from "../pages/UserSignUp";
import UserForgotPassword from "../pages/UserForgotPassword";

const NAV_LINKS = [
  { label: "Forecast", to: "/forecast" },
  { label: "Classifier", to: "/classifier" },
  { label: "Recommendation", to: "/recommendation" },
];

export default function Header() {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isUserOpen, setIsUserOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authView, setAuthView] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return window.localStorage.getItem("mamav-theme") === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem("mamav-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={isDarkMode}
            onClick={() => setIsDarkMode((enabled) => !enabled)}
            className="w-10 h-10 rounded-full border border-ink/10 bg-white/60 text-ink flex items-center justify-center hover:bg-white transition-colors dark-mode-toggle"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <Link to="/" className="flex items-center shrink-0">
            <img
              src="/mamavlogo.png"
              alt="MAMAV"
              className="h-10 w-auto object-contain"
            />
          </Link>
        </div>

        {/* Navigation links — right side */}
        <nav className="flex items-center gap-8 text-sm text-ink/80">
          {NAV_LINKS.map(({ label, to }) => (
            <Link
              key={label}
              to={to}
              className="hover:text-ink transition-colors font-display"
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
          <button
            type="button"
            aria-label={isLoggedIn ? "Open user profile" : "Sign up or log in"}
            aria-expanded={isUserOpen || Boolean(authView)}
            onClick={() => {
              if (isLoggedIn) {
                setIsUserOpen(true);
              } else {
                setAuthView("signup");
              }
            }}
            className="w-10 h-10 rounded-full bg-linear-to-br from-teal to-mint text-ink font-display font-bold flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isLoggedIn ? (
              <span aria-hidden="true">
                {userProfile?.name?.slice(0, 2).toUpperCase() || "US"}
              </span>
            ) : (
              <UserRound className="w-5 h-5" />
            )}
          </button>
        </nav>
      </div>
      {isUserOpen && (
        <User
          onClose={() => setIsUserOpen(false)}
          user={userProfile}
          onLogout={() => {
            setIsLoggedIn(false);
            setUserProfile(null);
            setIsUserOpen(false);
          }}
        />
      )}
      {authView === "signup" && (
        <UserSignUp
          onClose={() => setAuthView(null)}
          onLogIn={() => setAuthView("login")}
          onComplete={(profile) => {
            setUserProfile(profile);
            setIsLoggedIn(true);
            setAuthView(null);
            setIsUserOpen(true);
          }}
        />
      )}
      {authView === "login" && (
        <UserLogIn
          onClose={() => setAuthView(null)}
          onSignUp={() => setAuthView("signup")}
          onForgotPassword={() => setAuthView("forgot-password")}
          onComplete={(profile) => {
            setUserProfile(profile);
            setIsLoggedIn(true);
            setAuthView(null);
            setIsUserOpen(true);
          }}
        />
      )}
      {authView === "forgot-password" && (
        <UserForgotPassword
          onClose={() => setAuthView(null)}
          onLogIn={() => setAuthView("login")}
        />
      )}
    </header>
  );
}