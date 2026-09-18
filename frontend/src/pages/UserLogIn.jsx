import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";

export default function UserLogIn({ onClose, onSignUp, onComplete }) {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const navigate = useNavigate();

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  // ==========================================================
  // CLOSE WITH ESCAPE
  // ==========================================================

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // ==========================================================
  // LOGIN
  // ==========================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to log in.");
      }

      // ======================================================
      // SAVE JWT
      // ======================================================

      localStorage.setItem("mamav_token", data.token);

      // ======================================================
      // SAVE USER
      // ======================================================

      localStorage.setItem("mamav_user", JSON.stringify(data.user));

      // ======================================================
      // COMPLETE LOGIN
      // ======================================================

      onComplete({
        ...data.user,
        name: data.user.username,
        token: data.token,
      });

      // ======================================================
      // CLOSE MODAL
      // ======================================================

      onClose();
    } catch (error) {
      console.error("Login error:", error);

      setError(error.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // FORGOT PASSWORD
  // ==========================================================

  function handleForgotPassword() {
    onClose();

    navigate("/forgot-password");
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="
        fixed
        inset-0
        z-[9999]
        bg-ink/45
        backdrop-blur-[2px]
        p-4
        flex
        items-center
        justify-center
      "
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="
          relative
          w-full
          max-w-md
          rounded-3xl
          bg-cream-light
          p-6
          md:p-8
          shadow-2xl
        "
      >
        {/* ==================================================
            CLOSE BUTTON
            ================================================== */}

        <button
          type="button"
          aria-label="Close log in"
          onClick={onClose}
          className="
            absolute
            top-5
            right-5
            w-9
            h-9
            rounded-full
            bg-white/80
            text-ink/70
            flex
            items-center
            justify-center
            hover:bg-white
            transition-colors
          "
        >
          <X className="w-5 h-5" />
        </button>

        {/* ==================================================
            HEADER
            ================================================== */}

        <p
          className="
            text-sm
            text-teal
            font-medium
          "
        >
          Welcome back
        </p>

        <h1
          id="login-title"
          className="
            font-display
            font-bold
            text-3xl
            mt-2
          "
        >
          Log in to MaMaV
        </h1>

        <p
          className="
            text-sm
            text-ink/65
            mt-3
          "
        >
          Access your market insights and account activity.
        </p>

        {/* ==================================================
            ERROR MESSAGE
            ================================================== */}

        {error && (
          <div
            className="
              mt-5
              rounded-xl
              border
              border-red-200
              bg-red-50
              px-4
              py-3
              text-sm
              text-red-700
            "
          >
            {error}
          </div>
        )}

        {/* ==================================================
            LOGIN FORM
            ================================================== */}

        <form
          onSubmit={handleSubmit}
          className="
            mt-6
            space-y-4
          "
        >
          <label
            className="
              block
              text-sm
              font-medium
            "
          >
            Email address
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="
                mt-2
                w-full
                rounded-xl
                border
                border-ink/15
                bg-white
                px-4
                py-3
                outline-none
                focus:ring-2
                focus:ring-teal/40
              "
              placeholder="you@example.com"
            />
          </label>

          <label
            className="
              block
              text-sm
              font-medium
            "
          >
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="
                mt-2
                w-full
                rounded-xl
                border
                border-ink/15
                bg-white
                px-4
                py-3
                outline-none
                focus:ring-2
                focus:ring-teal/40
              "
              placeholder="Enter your password"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="
              w-full
              rounded-full
              bg-ink
              px-5
              py-3
              text-sm
              font-medium
              text-cream-light
              hover:bg-ink/90
              transition-colors
              disabled:opacity-50
              disabled:cursor-not-allowed
            "
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        {/* ==================================================
            FORGOT PASSWORD
            ================================================== */}

        <button
          type="button"
          onClick={handleForgotPassword}
          className="
            w-full
            mt-4
            text-sm
            text-teal
            hover:text-teal-dark
            transition-colors
          "
        >
          Forgot password?
        </button>

        {/* ==================================================
            SIGN UP
            ================================================== */}

        <button
          type="button"
          onClick={onSignUp}
          className="
            w-full
            mt-5
            text-sm
            text-teal
            hover:text-teal-dark
            transition-colors
          "
        >
          Don't have an account? Sign up
        </button>
      </section>
    </div>,

    document.body,
  );
}
