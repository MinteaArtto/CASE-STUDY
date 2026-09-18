import { useState } from "react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  // ==========================================================
  // SEND RESET LINK
  // ==========================================================

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          email: email.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not send reset email.");
      }

      setMessage(data.message);
    } catch (error) {
      console.error("Forgot password error:", error);

      setError(error.message || "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <main
      className="
        min-h-screen
        bg-cream-light
        px-4
        py-12
        flex
        items-center
        justify-center
      "
    >
      <div
        className="
          w-full
          max-w-md
          rounded-3xl
          bg-white
          border
          border-ink/10
          shadow-sm
          p-6
          sm:p-8
        "
      >
        <div
          className="
            text-sm
            text-teal
            font-medium
          "
        >
          Password recovery
        </div>

        <h1
          className="
            mt-2
            text-3xl
            font-display
            font-bold
          "
        >
          Forgot your password?
        </h1>

        <p
          className="
            mt-3
            text-sm
            leading-relaxed
            text-ink/60
          "
        >
          Enter the email associated with your MaMaV account and we'll send you
          a password reset link.
        </p>

        {/* SUCCESS */}

        {message && (
          <div
            className="
              mt-5
              rounded-xl
              border
              border-green-200
              bg-green-50
              px-4
              py-3
              text-sm
              text-green-700
            "
          >
            {message}

            <p
              className="
                mt-2
                text-xs
                text-green-700/80
              "
            >
              During development, check your Mailtrap Sandbox inbox for the
              reset email.
            </p>
          </div>
        )}

        {/* ERROR */}

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

        {/* FORM */}

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
              placeholder="you@example.com"
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
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <Link
          to="/"
          className="
            block
            mt-5
            text-center
            text-sm
            text-teal
            hover:text-teal-dark
            transition-colors
          "
        >
          Back to login
        </Link>
      </div>
    </main>
  );
}
