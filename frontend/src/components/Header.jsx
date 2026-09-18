import { Link, useLocation, useNavigate } from "react-router-dom";

import { useEffect, useState } from "react";

import { Menu, Moon, Sun, X } from "lucide-react";

import User from "../pages/User";
import UserLogIn from "../pages/UserLogIn";
import UserSignUp from "../pages/UserSignUp";

// ============================================================
// NORMAL USER NAVIGATION
// ============================================================

const USER_NAV_LINKS = [
  {
    label: "Forecast",
    to: "/forecast",
  },
  {
    label: "Classifier",
    to: "/classifier",
  },
];

// ============================================================
// LOAD STORED USER IMMEDIATELY
// ============================================================

const getStoredUser = () => {
  try {
    const storedProfile = window.localStorage.getItem("mamav_user");

    const storedToken = window.localStorage.getItem("mamav_token");

    if (!storedProfile || !storedToken) {
      return null;
    }

    return JSON.parse(storedProfile);
  } catch (error) {
    console.error("Could not load stored user:", error);

    window.localStorage.removeItem("mamav_user");

    window.localStorage.removeItem("mamav_token");

    return null;
  }
};

// ============================================================
// HEADER
// ============================================================

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const [initialUser] = useState(() => getStoredUser());

  const [isVisible, setIsVisible] = useState(true);

  const [lastScrollY, setLastScrollY] = useState(0);

  const [isUserOpen, setIsUserOpen] = useState(false);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [userProfile, setUserProfile] = useState(initialUser);

  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(initialUser));

  const [authView, setAuthView] = useState(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return window.localStorage.getItem("mamav-theme") === "dark";
  });

  // ==========================================================
  // ADMIN CHECK
  // ==========================================================

  const isAdmin = userProfile?.role === "admin";

  // ==========================================================
  // CURRENT PAGE
  // ==========================================================

  const isCurrentPage = (path) => {
    return location.pathname === path;
  };

  // ==========================================================
  // DESKTOP NAV LINK CLASS
  // ==========================================================

  const getNavClass = (active) => {
    return `
      relative
      header-nav-link
      font-display
      font-medium
      transition-colors
      duration-200

      ${
        active
          ? `
            text-teal
            after:absolute
            after:left-0
            after:right-0
            after:-bottom-2
            after:h-[2px]
            after:rounded-full
            after:bg-teal
          `
          : `
            text-ink/70
            hover:text-ink
          `
      }
    `;
  };

  // ==========================================================
  // MOBILE NAV LINK CLASS
  // ==========================================================

  const getMobileNavClass = (active) => {
    return `
      w-full

      rounded-xl

      px-4
      py-3

      text-left
      text-sm

      font-display
      font-medium

      transition-colors

      ${
        active
          ? `
            bg-teal/10
            text-teal

            dark:bg-[#c084fc]/10
            dark:text-[#c084fc]
          `
          : `
            text-ink/70

            hover:bg-ink/5
            hover:text-ink

            dark:hover:bg-white/5
          `
      }
    `;
  };

  // ==========================================================
  // KEEP AUTH STATE UPDATED
  // ==========================================================

  useEffect(() => {
    const loadAuthState = () => {
      const storedProfile = window.localStorage.getItem("mamav_user");

      const storedToken = window.localStorage.getItem("mamav_token");

      if (storedProfile && storedToken) {
        try {
          const parsedProfile = JSON.parse(storedProfile);

          setUserProfile(parsedProfile);

          setIsLoggedIn(true);
        } catch (error) {
          console.error("Could not load stored user:", error);

          window.localStorage.removeItem("mamav_user");

          window.localStorage.removeItem("mamav_token");

          setUserProfile(null);

          setIsLoggedIn(false);
        }
      } else {
        setUserProfile(null);
        setIsLoggedIn(false);
      }
    };

    loadAuthState();

    window.addEventListener("mamav-auth-change", loadAuthState);

    return () => {
      window.removeEventListener("mamav-auth-change", loadAuthState);
    };
  }, []);

  // ==========================================================
  // DARK MODE
  // ==========================================================

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);

    window.localStorage.setItem("mamav-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  // ==========================================================
  // CLOSE MOBILE MENU AFTER NAVIGATION
  // ==========================================================

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // ==========================================================
  // HIDE HEADER WHILE SCROLLING DOWN
  // ==========================================================

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (isMobileMenuOpen) {
        setIsVisible(true);

        setLastScrollY(currentScrollY);

        return;
      }

      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [lastScrollY, isMobileMenuOpen]);

  // ==========================================================
  // AUTH SUCCESS
  // ==========================================================

  const handleAuthComplete = (profile) => {
    setUserProfile(profile);

    setIsLoggedIn(true);

    setAuthView(null);

    setIsUserOpen(false);

    setIsMobileMenuOpen(false);

    window.localStorage.setItem("mamav_user", JSON.stringify(profile));

    window.dispatchEvent(new Event("mamav-auth-change"));

    if (profile?.role === "admin") {
      navigate("/admin/price-update");

      return;
    }

    navigate("/forecast");
  };

  // ==========================================================
  // LOG OUT
  // ==========================================================

  const handleLogout = () => {
    window.localStorage.removeItem("mamav_user");

    window.localStorage.removeItem("mamav_token");

    setUserProfile(null);

    setIsLoggedIn(false);

    setIsUserOpen(false);

    setAuthView(null);

    setIsMobileMenuOpen(false);

    window.dispatchEvent(new Event("mamav-auth-change"));

    navigate("/");
  };

  // ==========================================================
  // USER INITIALS
  // ==========================================================

  const getUserInitials = () => {
    const username = userProfile?.username || userProfile?.name || "";

    if (!username) {
      return isAdmin ? "AD" : "US";
    }

    return username.slice(0, 2).toUpperCase();
  };

  // ==========================================================
  // LOGO DESTINATION
  // ==========================================================

  const getLogoDestination = () => {
    if (!isLoggedIn) {
      return "/";
    }

    if (isAdmin) {
      return "/admin/price-update";
    }

    return "/forecast";
  };

  // ==========================================================
  // OPEN PROFILE
  // ==========================================================

  const handleOpenProfile = () => {
    setIsMobileMenuOpen(false);

    setIsUserOpen(true);
  };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <>
      <header
        className={`
          sticky
          top-0
          z-50

          bg-white/95
          dark:bg-[#151817]/95

          backdrop-blur-md

          border-b
          border-ink/10
          dark:border-white/10

          shadow-[0_2px_10px_rgba(0,0,0,0.03)]
          dark:shadow-[0_2px_18px_rgba(0,0,0,0.35)]

          transition-transform
          duration-300

          ${isVisible ? "translate-y-0" : "-translate-y-full"}
        `}
      >
        <div
          className="
            max-w-6xl
            mx-auto

            px-4
            sm:px-6

            h-16

            flex
            items-center
            justify-between

            gap-4
          "
        >
          {/* ==================================================
              LEFT SIDE
              ================================================== */}

          <div
            className="
              flex
              items-center

              gap-2
              sm:gap-3

              shrink-0
            "
          >
            <button
              type="button"
              aria-label={
                isDarkMode ? "Switch to light mode" : "Switch to dark mode"
              }
              aria-pressed={isDarkMode}
              onClick={() => setIsDarkMode((enabled) => !enabled)}
              className="
                w-8
                h-8

                sm:w-10
                sm:h-10

                rounded-full

                border
                border-ink/15
                dark:border-white/15

                bg-white
                dark:bg-white/5

                text-ink

                flex
                items-center
                justify-center

                hover:bg-ink/5
                dark:hover:bg-white/10

                transition-colors

                dark-mode-toggle

                shrink-0
              "
            >
              {isDarkMode ? (
                <Sun
                  className="
                    w-4
                    h-4

                    sm:w-5
                    sm:h-5
                  "
                />
              ) : (
                <Moon
                  className="
                    w-4
                    h-4

                    sm:w-5
                    sm:h-5
                  "
                />
              )}
            </button>

            <Link
              to={getLogoDestination()}
              className="
                flex
                items-center

                shrink-0
              "
            >
              <img
                src="/mamavlogo.png"
                alt="MaMaV"
                className="
                  h-7
                  sm:h-10

                  w-auto

                  object-contain
                "
              />
            </Link>
          </div>

          {/* ==================================================
              PUBLIC NAVIGATION
              ================================================== */}

          {!isLoggedIn && (
            <nav
              className="
                flex
                items-center
                justify-end

                gap-2.5
                sm:gap-5
                md:gap-7

                min-w-0
              "
            >
              <Link
                to="/about"
                className={`
                  whitespace-nowrap

                  text-[11px]
                  sm:text-sm

                  ${getNavClass(isCurrentPage("/about"))}
                `}
              >
                About
              </Link>

              <button
                type="button"
                onClick={() => setAuthView("login")}
                className="
                  header-nav-link

                  whitespace-nowrap

                  font-display
                  font-medium

                  text-[11px]
                  sm:text-sm

                  text-ink/70

                  hover:text-ink

                  transition-colors
                "
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={() => setAuthView("signup")}
                className="
                  whitespace-nowrap

                  bg-ink
                  dark:bg-[#c084fc]

                  text-cream-light
                  dark:text-[#17181a]

                  text-[10px]
                  sm:text-sm

                  font-medium

                  px-3
                  sm:px-5

                  py-2
                  sm:py-2.5

                  rounded-full

                  hover:bg-ink/90
                  dark:hover:bg-[#d8b4fe]

                  transition-colors
                "
              >
                Get Started
              </button>
            </nav>
          )}

          {/* ==================================================
              DESKTOP NORMAL USER NAVIGATION
              ================================================== */}

          {isLoggedIn && !isAdmin && (
            <nav
              className="
                  hidden
                  md:flex

                  items-center
                  gap-7

                  text-sm
                "
            >
              {USER_NAV_LINKS.map(({ label, to }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => navigate(to)}
                  className={getNavClass(isCurrentPage(to))}
                >
                  {label}
                </button>
              ))}

              <Link
                to="/about"
                className={getNavClass(isCurrentPage("/about"))}
              >
                About
              </Link>

              <button
                type="button"
                aria-label="Open user profile"
                aria-expanded={isUserOpen}
                onClick={() => setIsUserOpen(true)}
                className="
                    w-10
                    h-10

                    rounded-full

                    bg-linear-to-br
                    from-teal
                    to-mint

                    text-ink

                    font-display
                    font-bold

                    flex
                    items-center
                    justify-center

                    border
                    border-ink/5

                    hover:scale-105
                    hover:shadow-md

                    transition-all
                  "
              >
                <span aria-hidden="true">{getUserInitials()}</span>
              </button>
            </nav>
          )}

          {/* ==================================================
              DESKTOP ADMIN NAVIGATION
              ================================================== */}

          {isLoggedIn && isAdmin && (
            <nav
              className="
                  hidden
                  md:flex

                  items-center
                  gap-7

                  text-sm
                "
            >
              <button
                type="button"
                onClick={() => navigate("/admin/price-update")}
                className={getNavClass(isCurrentPage("/admin/price-update"))}
              >
                Price Update
              </button>

              <button
                type="button"
                aria-label="Open admin profile"
                aria-expanded={isUserOpen}
                onClick={() => setIsUserOpen(true)}
                className="
                    w-10
                    h-10

                    rounded-full

                    bg-linear-to-br
                    from-teal
                    to-mint

                    text-ink

                    font-display
                    font-bold

                    flex
                    items-center
                    justify-center

                    border
                    border-ink/5

                    hover:scale-105
                    hover:shadow-md

                    transition-all
                  "
              >
                <span aria-hidden="true">{getUserInitials()}</span>
              </button>
            </nav>
          )}

          {/* ==================================================
              MOBILE MENU BUTTON
              LOGGED-IN USERS ONLY
              ================================================== */}

          {isLoggedIn && (
            <button
              type="button"
              aria-label={
                isMobileMenuOpen
                  ? "Close navigation menu"
                  : "Open navigation menu"
              }
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className="
                md:hidden

                w-10
                h-10

                rounded-xl

                border
                border-ink/10
                dark:border-white/10

                bg-white
                dark:bg-white/5

                text-ink

                flex
                items-center
                justify-center

                hover:bg-ink/5
                dark:hover:bg-white/10

                transition-colors

                shrink-0
              "
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        {/* ==================================================
            LOGGED-IN MOBILE MENU
            ================================================== */}

        {isLoggedIn && isMobileMenuOpen && (
          <div
            className="
                md:hidden

                border-t
                border-ink/10
                dark:border-white/10

                bg-white
                dark:bg-[#151817]
              "
          >
            <div
              className="
                  max-w-6xl
                  mx-auto

                  px-4
                  sm:px-6

                  py-4

                  space-y-2
                "
            >
              {!isAdmin && (
                <>
                  {USER_NAV_LINKS.map(({ label, to }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => navigate(to)}
                      className={getMobileNavClass(isCurrentPage(to))}
                    >
                      {label}
                    </button>
                  ))}

                  <Link
                    to="/about"
                    className={getMobileNavClass(isCurrentPage("/about"))}
                  >
                    About
                  </Link>
                </>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => navigate("/admin/price-update")}
                  className={getMobileNavClass(
                    isCurrentPage("/admin/price-update"),
                  )}
                >
                  Price Update
                </button>
              )}

              <div
                className="
                    pt-3
                    mt-3

                    border-t
                    border-ink/10
                    dark:border-white/10
                  "
              >
                <button
                  type="button"
                  onClick={handleOpenProfile}
                  className="
                      w-full

                      flex
                      items-center
                      gap-3

                      rounded-xl

                      px-3
                      py-3

                      hover:bg-ink/5
                      dark:hover:bg-white/5

                      transition-colors
                    "
                >
                  <div
                    className="
                        w-10
                        h-10

                        rounded-full

                        bg-linear-to-br
                        from-teal
                        to-mint

                        text-ink

                        font-display
                        font-bold

                        flex
                        items-center
                        justify-center

                        shrink-0
                      "
                  >
                    {getUserInitials()}
                  </div>

                  <div
                    className="
                        min-w-0

                        text-left
                      "
                  >
                    <p
                      className="
                          text-sm
                          font-medium

                          truncate
                        "
                    >
                      {userProfile?.username ||
                        userProfile?.name ||
                        (isAdmin ? "Administrator" : "User")}
                    </p>

                    <p
                      className="
                          text-xs
                          text-ink/45

                          truncate
                        "
                    >
                      {userProfile?.email}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ======================================================
          PROFILE MODAL
          ====================================================== */}

      {isLoggedIn && isUserOpen && (
        <User
          onClose={() => setIsUserOpen(false)}
          user={userProfile}
          onLogout={handleLogout}
        />
      )}

      {/* ======================================================
          SIGN UP
          ====================================================== */}

      {authView === "signup" && (
        <UserSignUp
          onClose={() => setAuthView(null)}
          onLogIn={() => setAuthView("login")}
          onComplete={handleAuthComplete}
        />
      )}

      {/* ======================================================
          LOGIN
          ====================================================== */}

      {authView === "login" && (
        <UserLogIn
          onClose={() => setAuthView(null)}
          onSignUp={() => setAuthView("signup")}
          onComplete={handleAuthComplete}
        />
      )}
    </>
  );
}
