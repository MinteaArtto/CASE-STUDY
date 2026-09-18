import { useEffect, useState } from "react";

import { Link } from "react-router-dom";

// ============================================================
// GET STORED USER
// ============================================================

const getStoredUser = () => {
  try {
    const storedUser = window.localStorage.getItem("mamav_user");

    const token = window.localStorage.getItem("mamav_token");

    if (!storedUser || !token) {
      return null;
    }

    return JSON.parse(storedUser);
  } catch (error) {
    console.error("Could not load stored user:", error);

    return null;
  }
};

// ============================================================
// FOOTER
// ============================================================

export default function Footer() {
  const [userProfile, setUserProfile] = useState(() => getStoredUser());

  // ==========================================================
  // AUTH STATE
  // ==========================================================

  useEffect(() => {
    const checkAuth = () => {
      setUserProfile(getStoredUser());
    };

    checkAuth();

    window.addEventListener("mamav-auth-change", checkAuth);

    return () => {
      window.removeEventListener("mamav-auth-change", checkAuth);
    };
  }, []);

  // ==========================================================
  // AUTH INFO
  // ==========================================================

  const isLoggedIn = Boolean(userProfile);

  const isAdmin = userProfile?.role === "admin";

  // ==========================================================
  // FOOTER LINKS
  // ==========================================================

  const getNavigationLinks = () => {
    if (isLoggedIn && isAdmin) {
      return [
        {
          label: "Price Update",
          to: "/admin/price-update",
        },

        {
          label: "About",
          to: "/about",
        },
      ];
    }

    if (isLoggedIn) {
      return [
        {
          label: "Forecast",
          to: "/forecast",
        },

        {
          label: "Classifier",
          to: "/classifier",
        },

        {
          label: "About",
          to: "/about",
        },
      ];
    }

    return [
      {
        label: "Home",
        to: "/",
      },

      {
        label: "About",
        to: "/about",
      },
    ];
  };

  const navigationLinks = getNavigationLinks();

  const currentYear = new Date().getFullYear();

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
  // RENDER
  // ==========================================================

  return (
    <footer
      className="
        bg-[#F8F7F2]
        dark:bg-[#151817]

        border-t
        border-ink/10
        dark:border-white/10

        text-ink
      "
    >
      <div
        className="
          max-w-6xl
          mx-auto

          px-4
          sm:px-6

          py-8
        "
      >
        {/* ==================================================
            MAIN AREA
            ================================================== */}

        <div
          className="
            grid
            gap-8

            md:grid-cols-[1.4fr_1fr]

            md:items-center
          "
        >
          {/* ================================================
              BRAND
              ================================================ */}

          <div>
            <Link
              to={getLogoDestination()}
              className="
                inline-flex
                items-center
                gap-3
              "
            >
              <img
                src="/mamavlogo.png"
                alt="MaMaV"
                className="
                  h-9

                  w-auto

                  object-contain
                "
              />

              <span
                className="
                  font-display
                  font-bold

                  text-lg
                  text-ink
                "
              >
                MaMaV
              </span>
            </Link>

            <p
              className="
                mt-3

                max-w-lg

                text-sm
                leading-6

                text-ink/55
              "
            >
              A student-developed predictive analytics system for market price
              forecasting and spoilage classification of selected perishable
              goods.
            </p>
          </div>

          {/* ================================================
              NAVIGATION
              ================================================ */}

          <nav
            className="
              flex
              flex-wrap

              gap-x-7
              gap-y-3

              md:justify-end
            "
          >
            {navigationLinks.map(({ label, to }) => (
              <Link
                key={label}
                to={to}
                className="
                    relative

                    text-sm
                    font-medium

                    text-ink/60

                    hover:text-teal

                    dark:hover:text-[#8fc8c0]

                    transition-colors
                    duration-200
                  "
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* ==================================================
            BOTTOM AREA
            ================================================== */}

        <div
          className="
            mt-7
            pt-5

            border-t
            border-ink/10
            dark:border-white/10

            flex
            flex-col

            gap-2

            sm:flex-row
            sm:items-center
            sm:justify-between

            text-xs
            text-ink/45
          "
        >
          <p>© {currentYear} MaMaV</p>

          <p>Developed as an academic project.</p>
        </div>
      </div>
    </footer>
  );
}
