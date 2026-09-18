import { useState } from "react";

import { Link, useParams } from "react-router-dom";

export default function ResetPassword() {
  const { token } = useParams();

  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState(false);

  // ==========================================================
  // RESET PASSWORD
  // ==========================================================

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    // ========================================================
    // MATCH PASSWORDS
    // ========================================================

    if (password !== confirmPassword) {
      setError("Passwords do not match.");

      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/auth/reset-password/${token}`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            password,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not reset password.");
      }

      setSuccess(true);

      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Reset password error:", error);

      setError(error.message || "Could not reset password.");
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
          Password reset
        </div>

        <h1
          className="
            mt-2
            text-3xl
            font-display
            font-bold
          "
        >
          Create a new password
        </h1>

        <p
          className="
            mt-3
            text-sm
            leading-relaxed
            text-ink/60
          "
        >
          Your new password must contain uppercase and lowercase letters, a
          number, and a special character.
        </p>

        {/* ==================================================
            SUCCESS
            ================================================== */}

        {success ? (
          <>
            <div
              className="
                mt-6
                rounded-xl
                border
                border-green-200
                bg-green-50
                px-4
                py-4
                text-sm
                text-green-700
              "
            >
              <div
                className="
                  font-semibold
                "
              >
                Password changed
              </div>

              <p className="mt-1">
                Your password was reset successfully. You can now log in with
                your new password.
              </p>
            </div>

            <Link
              to="/"
              className="
                block
                mt-6
                w-full
                rounded-full
                bg-ink
                px-5
                py-3
                text-center
                text-sm
                font-medium
                text-cream-light
                hover:bg-ink/90
                transition-colors
              "
            >
              Return to login
            </Link>
          </>
        ) : (
          <>
            {/* ================================================
                ERROR
                ================================================ */}

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

            {/* ================================================
                FORM
                ================================================ */}

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
                New password
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Enter your new password"
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

              <label
                className="
                  block
                  text-sm
                  font-medium
                "
              >
                Confirm password
                <input
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Confirm your new password"
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

              <div
                className="
                  text-xs
                  leading-relaxed
                  text-ink/50
                "
              >
                Password must be 8-20 characters and include an uppercase
                letter, lowercase letter, number, and special character.
              </div>

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
                {loading ? "Resetting..." : "Reset password"}
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
          </>
        )}
      </div>
    </main>
  );
}
