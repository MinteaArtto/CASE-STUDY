import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function UserSignUp({ onClose, onLogIn, onComplete }) {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const [accountName, setAccountName] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  // ==========================================================
  // USERNAME VALIDATION
  // ==========================================================

  const usernameChecks = {
    length: accountName.length >= 2 && accountName.length <= 30,

    allowedCharacters: /^[A-Za-z0-9_.]*$/.test(accountName),
  };

  const usernameIsValid =
    accountName.length > 0 && Object.values(usernameChecks).every(Boolean);

  // ==========================================================
  // EMAIL VALIDATION
  // ==========================================================

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // ==========================================================
  // PASSWORD VALIDATION
  // ==========================================================

  const passwordChecks = {
    length: password.length >= 8 && password.length <= 20,

    uppercase: /[A-Z]/.test(password),

    lowercase: /[a-z]/.test(password),

    number: /\d/.test(password),

    special: /[^A-Za-z0-9]/.test(password),
  };

  const passwordIsValid = Object.values(passwordChecks).every(Boolean);

  // ==========================================================
  // CONFIRM PASSWORD
  // ==========================================================

  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  // ==========================================================
  // WHOLE FORM VALIDATION
  // ==========================================================

  const formIsValid =
    usernameIsValid && emailIsValid && passwordIsValid && passwordsMatch;

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

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ==========================================================
  // SIGN UP
  // ==========================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    // ======================================================
    // USERNAME CHECK
    // ======================================================

    if (!usernameIsValid) {
      setError("Please make sure your username meets all requirements.");

      return;
    }

    // ======================================================
    // EMAIL CHECK
    // ======================================================

    if (!emailIsValid) {
      setError("Please enter a valid email address.");

      return;
    }

    // ======================================================
    // PASSWORD CHECK
    // ======================================================

    if (!passwordIsValid) {
      setError("Please make sure your password meets all requirements.");

      return;
    }

    // ======================================================
    // CONFIRM PASSWORD CHECK
    // ======================================================

    if (!passwordsMatch) {
      setError("Passwords do not match.");

      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          username: accountName.trim(),

          email: email.trim().toLowerCase(),

          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to create account.");
      }

      // ====================================================
      // SAVE JWT
      // ====================================================

      localStorage.setItem("mamav_token", data.token);

      // ====================================================
      // SAVE USER
      // ====================================================

      localStorage.setItem("mamav_user", JSON.stringify(data.user));

      // ====================================================
      // SEND USER TO PARENT
      // ====================================================

      onComplete({
        ...data.user,

        name: data.user.username,

        token: data.token,
      });

      // ====================================================
      // CLOSE MODAL
      // ====================================================

      onClose();
    } catch (error) {
      console.error("Signup error:", error);

      setError(error.message || "Unable to create account.");
    } finally {
      setLoading(false);
    }
  };

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
        aria-labelledby="signup-title"
        className="
          relative
          w-full
          max-w-md
          max-h-[90vh]
          rounded-3xl
          bg-cream-light
          shadow-2xl
          overflow-hidden
        "
      >
        {/* ==================================================
            INTERNAL SCROLL AREA
            ================================================== */}

        <div
          className="
            signup-scrollbar
            max-h-[90vh]
            overflow-y-auto
            p-6
            md:p-8
          "
        >
          {/* ==================================================
              CLOSE BUTTON
              ================================================== */}

          <button
            type="button"
            aria-label="Close sign up"
            onClick={onClose}
            className="
              absolute
              top-5
              right-5
              z-10
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

          <p className="text-sm text-teal font-medium">Welcome to MaMaV</p>

          <h1
            id="signup-title"
            className="
              font-display
              font-bold
              text-3xl
              mt-2
              pr-10
            "
          >
            Create your account
          </h1>

          <p className="text-sm text-ink/65 mt-3">
            Sign up to keep your market insights in one place.
          </p>

          {/* ==================================================
              GENERAL ERROR
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
              FORM
              ================================================== */}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* ================================================
                USERNAME
                ================================================ */}

            <label className="block text-sm font-medium">
              Account name / username
              <input
                required
                type="text"
                minLength={2}
                maxLength={30}
                value={accountName}
                onChange={(event) => {
                  setAccountName(event.target.value);

                  setError("");
                }}
                autoComplete="username"
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
                placeholder="e.g. John123"
              />
              {/* ==============================================
                  LIVE USERNAME REQUIREMENTS
                  ============================================== */}
              {accountName.length > 0 && (
                <div className="mt-3 space-y-1.5 text-sm font-normal">
                  <p
                    className={
                      usernameChecks.length ? "text-green-600" : "text-red-600"
                    }
                  >
                    {usernameChecks.length ? "✓" : "✕"} 2–30 characters
                  </p>

                  <p
                    className={
                      usernameChecks.allowedCharacters
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {usernameChecks.allowedCharacters ? "✓" : "✕"} Letters,
                    numbers, underscores, and periods only
                  </p>
                </div>
              )}
            </label>

            {/* ================================================
                EMAIL
                ================================================ */}

            <label className="block text-sm font-medium">
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);

                  setError("");
                }}
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
              {/* ==============================================
                  EMAIL LIVE ERROR
                  ============================================== */}
              {email.length > 0 && !emailIsValid && (
                <p className="mt-2 text-sm font-normal text-red-600">
                  ✕ Enter a valid email address
                </p>
              )}
              {email.length > 0 && emailIsValid && (
                <p className="mt-2 text-sm font-normal text-green-600">
                  ✓ Email format looks valid
                </p>
              )}
            </label>

            {/* ================================================
                PASSWORD
                ================================================ */}

            <label className="block text-sm font-medium">
              Password
              <input
                required
                type="password"
                minLength={8}
                maxLength={20}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);

                  setError("");
                }}
                autoComplete="new-password"
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
                placeholder="Enter a password"
              />
              {/* ==============================================
                  LIVE PASSWORD REQUIREMENTS
                  ============================================== */}
              {password.length > 0 && (
                <div className="mt-3 space-y-1.5 text-sm font-normal">
                  <p
                    className={
                      passwordChecks.length ? "text-green-600" : "text-red-600"
                    }
                  >
                    {passwordChecks.length ? "✓" : "✕"} 8–20 characters
                  </p>

                  <p
                    className={
                      passwordChecks.uppercase
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {passwordChecks.uppercase ? "✓" : "✕"} At least one
                    uppercase letter
                  </p>

                  <p
                    className={
                      passwordChecks.lowercase
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {passwordChecks.lowercase ? "✓" : "✕"} At least one
                    lowercase letter
                  </p>

                  <p
                    className={
                      passwordChecks.number ? "text-green-600" : "text-red-600"
                    }
                  >
                    {passwordChecks.number ? "✓" : "✕"} At least one number
                  </p>

                  <p
                    className={
                      passwordChecks.special ? "text-green-600" : "text-red-600"
                    }
                  >
                    {passwordChecks.special ? "✓" : "✕"} At least one special
                    character
                  </p>
                </div>
              )}
            </label>

            {/* ================================================
                CONFIRM PASSWORD
                ================================================ */}

            <label className="block text-sm font-medium">
              Confirm password
              <input
                required
                type="password"
                minLength={8}
                maxLength={20}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);

                  setError("");
                }}
                autoComplete="new-password"
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
                placeholder="Re-enter your password"
              />
              {/* ==============================================
                  LIVE PASSWORD MATCH
                  ============================================== */}
              {confirmPassword.length > 0 && (
                <p
                  className={`mt-2 text-sm font-normal ${
                    passwordsMatch ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {passwordsMatch
                    ? "✓ Passwords match"
                    : "✕ Passwords do not match"}
                </p>
              )}
            </label>

            {/* ================================================
                SIGN UP BUTTON
                ================================================ */}

            <button
              type="submit"
              disabled={loading || !formIsValid}
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
                disabled:opacity-40
                disabled:cursor-not-allowed
              "
            >
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </form>

          {/* ==================================================
              LOGIN LINK
              ================================================== */}

          <button
            type="button"
            onClick={onLogIn}
            className="
              w-full
              mt-5
              text-sm
              text-teal
              hover:text-teal-dark
              transition-colors
            "
          >
            Have an account? Log in
          </button>
        </div>
      </section>
    </div>,

    document.body,
  );
}
