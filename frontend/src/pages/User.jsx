import { useEffect, useState } from "react";

import { createPortal } from "react-dom";

import {
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  UserRound,
  X,
} from "lucide-react";

// ============================================================
// USER PROFILE
// ============================================================

export default function User({ onClose, user, onLogout }) {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // ==========================================================
  // USER INFO
  // ==========================================================

  const displayName = user?.username || user?.name || "User";

  const email = user?.email || "No email available";

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // ==========================================================
  // PASSWORD STATE
  // ==========================================================

  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");

  const [newPassword, setNewPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);

  const [showNewPassword, setShowNewPassword] = useState(false);

  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [passwordLoading, setPasswordLoading] = useState(false);

  const [passwordMessage, setPasswordMessage] = useState("");

  const [passwordError, setPasswordError] = useState("");

  // ==========================================================
  // ESCAPE
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
  // RESET PASSWORD FORM
  // ==========================================================

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");

    setShowCurrentPassword(false);

    setShowNewPassword(false);

    setShowConfirmPassword(false);

    setPasswordMessage("");
    setPasswordError("");
  };

  // ==========================================================
  // TOGGLE PASSWORD
  // ==========================================================

  const handleTogglePasswordForm = () => {
    if (showPasswordForm) {
      resetPasswordForm();

      setShowPasswordForm(false);

      return;
    }

    resetPasswordForm();

    setShowPasswordForm(true);
  };

  // ==========================================================
  // CHANGE PASSWORD
  // ==========================================================

  const handleChangePassword = async (event) => {
    event.preventDefault();

    setPasswordMessage("");
    setPasswordError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please complete all password fields.");

      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");

      return;
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

    if (!passwordRegex.test(newPassword)) {
      setPasswordError(
        "Password must be 8-20 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
      );

      return;
    }

    const token = window.localStorage.getItem("mamav_token");

    if (!token) {
      setPasswordError("Your session has expired. Please log in again.");

      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Could not change password.");
      }

      setPasswordMessage(data.message || "Password changed successfully.");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setShowCurrentPassword(false);

      setShowNewPassword(false);

      setShowConfirmPassword(false);
    } catch (error) {
      setPasswordError(error.message || "Could not change password.");
    } finally {
      setPasswordLoading(false);
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
        dark:bg-black/65

        backdrop-blur-[3px]

        p-4

        overflow-y-auto
      "
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-title"
        className="
          relative

          w-full
          max-w-lg

          mx-auto
          my-6

          rounded-[2rem]

          bg-white
          dark:bg-[#242927]

          border
          border-ink/10
          dark:border-white/10

          shadow-2xl

          overflow-hidden
        "
      >
        {/* ==================================================
            DECORATIVE TOP
            ================================================== */}

        <div
          className="
            absolute
            inset-x-0
            top-0

            h-36

            bg-linear-to-b
            from-mint-light
            to-white

            dark:from-[#29332f]
            dark:to-[#242927]

            pointer-events-none
          "
        />

        <div
          className="
            absolute

            -top-20
            -left-16

            w-52
            h-52

            rounded-full

            bg-teal/10

            blur-3xl

            pointer-events-none
          "
        />

        {/* ==================================================
            CLOSE
            ================================================== */}

        <button
          type="button"
          aria-label="Close user profile"
          onClick={onClose}
          className="
            absolute
            top-5
            right-5
            z-20

            w-10
            h-10

            rounded-full

            bg-white/80
            dark:bg-white/5

            border
            border-ink/10
            dark:border-white/10

            text-ink/55

            flex
            items-center
            justify-center

            shadow-sm

            hover:bg-white
            dark:hover:bg-white/10

            hover:text-ink

            transition-colors
          "
        >
          <X className="w-5 h-5" />
        </button>

        {/* ==================================================
            PROFILE HEADER
            ================================================== */}

        <div
          className="
            relative
            z-10

            px-7
            pt-10
            pb-7

            text-center
          "
        >
          <div
            className="
              w-24
              h-24

              mx-auto

              rounded-[1.8rem]

              bg-linear-to-br
              from-teal
              to-mint

              border
              border-white/70
              dark:border-white/10

              flex
              items-center
              justify-center

              text-ink

              font-display
              font-bold
              text-3xl

              shadow-lg
              shadow-teal/10
            "
          >
            {initials}
          </div>

          <h1
            id="user-profile-title"
            className="
              mt-5

              font-display
              font-bold

              text-2xl

              tracking-tight

              text-ink
            "
          >
            {displayName}
          </h1>

          <p
            className="
              mt-1

              text-sm
              text-ink/50
            "
          >
            Personal account
          </p>
        </div>

        {/* ==================================================
            CONTENT
            ================================================== */}

        <div
          className="
            relative
            z-10

            px-6
            sm:px-7

            pb-7
          "
        >
          {/* ==================================================
              PROFILE INFO
              ================================================== */}

          <div
            className="
              rounded-2xl

              bg-[#FCFBF5]
              dark:bg-white/5

              border
              border-ink/10
              dark:border-white/10

              shadow-sm

              overflow-hidden
            "
          >
            {/* NAME */}

            <div
              className="
                flex
                items-center

                gap-4

                px-5
                py-4

                border-b
                border-ink/10
                dark:border-white/10
              "
            >
              <div
                className="
                  w-11
                  h-11

                  rounded-xl

                  bg-mint
                  dark:bg-[#30403b]

                  text-teal-dark
                  dark:text-[#8fc8c0]

                  flex
                  items-center
                  justify-center

                  shrink-0
                "
              >
                <UserRound className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <p
                  className="
                    text-xs
                    text-ink/45
                  "
                >
                  Name
                </p>

                <p
                  className="
                    mt-0.5

                    text-sm
                    font-medium

                    text-ink

                    truncate
                  "
                >
                  {displayName}
                </p>
              </div>
            </div>

            {/* EMAIL */}

            <div
              className="
                flex
                items-center

                gap-4

                px-5
                py-4
              "
            >
              <div
                className="
                  w-11
                  h-11

                  rounded-xl

                  bg-mint
                  dark:bg-[#30403b]

                  text-teal-dark
                  dark:text-[#8fc8c0]

                  flex
                  items-center
                  justify-center

                  shrink-0
                "
              >
                <Mail className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <p
                  className="
                    text-xs
                    text-ink/45
                  "
                >
                  Email
                </p>

                <p
                  className="
                    mt-0.5

                    text-sm
                    font-medium

                    text-ink

                    truncate
                  "
                >
                  {email}
                </p>
              </div>
            </div>
          </div>

          {/* ==================================================
              CHANGE PASSWORD BUTTON
              ================================================== */}

          <button
            type="button"
            onClick={handleTogglePasswordForm}
            className="
              mt-5

              w-full

              rounded-xl

              border
              border-teal/20
              dark:border-white/10

              bg-mint-light/70
              dark:bg-white/5

              px-4
              py-3.5

              flex
              items-center
              justify-center

              gap-2

              text-sm
              font-medium

              text-teal-dark
              dark:text-[#8fc8c0]

              hover:bg-mint
              dark:hover:bg-white/10

              transition-colors
            "
          >
            <KeyRound className="w-4 h-4" />

            {showPasswordForm ? "Cancel password change" : "Change password"}
          </button>

          {/* ==================================================
              PASSWORD FORM
              ================================================== */}

          {showPasswordForm && (
            <form
              onSubmit={handleChangePassword}
              className="
                mt-4

                rounded-2xl

                bg-[#FCFBF5]
                dark:bg-white/5

                border
                border-ink/10
                dark:border-white/10

                p-5

                shadow-sm
              "
            >
              <div className="mb-5">
                <h2
                  className="
                    font-display
                    font-bold

                    text-lg
                    text-ink
                  "
                >
                  Change password
                </h2>

                <p
                  className="
                    mt-1

                    text-xs
                    leading-5

                    text-ink/50
                  "
                >
                  Enter your current password, then choose a new one.
                </p>
              </div>

              {/* CURRENT */}

              <PasswordField
                id="current-password"
                label="Current password"
                value={currentPassword}
                setValue={setCurrentPassword}
                visible={showCurrentPassword}
                setVisible={setShowCurrentPassword}
                autoComplete="current-password"
              />

              {/* NEW */}

              <div className="mt-4">
                <PasswordField
                  id="new-password"
                  label="New password"
                  value={newPassword}
                  setValue={setNewPassword}
                  visible={showNewPassword}
                  setVisible={setShowNewPassword}
                  autoComplete="new-password"
                />

                <p
                  className="
                    mt-2

                    text-[11px]
                    leading-4

                    text-ink/45
                  "
                >
                  8-20 characters with uppercase, lowercase, number, and special
                  character.
                </p>
              </div>

              {/* CONFIRM */}

              <div className="mt-4">
                <PasswordField
                  id="confirm-password"
                  label="Confirm new password"
                  value={confirmPassword}
                  setValue={setConfirmPassword}
                  visible={showConfirmPassword}
                  setVisible={setShowConfirmPassword}
                  autoComplete="new-password"
                />
              </div>

              {/* ERROR */}

              {passwordError && (
                <div
                  className="
                    mt-4

                    rounded-xl

                    border
                    border-red-500/20

                    bg-red-500/10

                    px-4
                    py-3

                    text-xs
                    leading-5

                    text-red-700
                    dark:text-red-300
                  "
                >
                  {passwordError}
                </div>
              )}

              {/* SUCCESS */}

              {passwordMessage && (
                <div
                  className="
                    mt-4

                    rounded-xl

                    border
                    border-green-500/20

                    bg-green-500/10

                    px-4
                    py-3

                    text-xs
                    leading-5

                    text-green-700
                    dark:text-green-300
                  "
                >
                  {passwordMessage}
                </div>
              )}

              {/* SUBMIT */}

              <button
                type="submit"
                disabled={passwordLoading}
                className="
                  mt-5

                  w-full

                  rounded-xl

                  bg-teal
                  dark:bg-[#5f9f97]

                  px-4
                  py-3.5

                  text-sm
                  font-semibold

                  text-white
                  dark:text-[#101513]

                  hover:bg-teal-dark
                  dark:hover:bg-[#6eaaa2]

                  disabled:opacity-50
                  disabled:cursor-not-allowed

                  transition-colors
                "
              >
                {passwordLoading ? "Updating..." : "Update password"}
              </button>
            </form>
          )}

          {/* ==================================================
              LOGOUT
              ================================================== */}

          <button
            type="button"
            onClick={onLogout}
            className="
              mt-4

              w-full

              rounded-xl

              border
              border-ink/10
              dark:border-white/10

              bg-white
              dark:bg-white/5

              px-4
              py-3.5

              flex
              items-center
              justify-center

              gap-2

              text-sm
              font-medium

              text-ink/60

              hover:bg-red-50
              hover:text-red-700
              hover:border-red-200

              dark:hover:bg-red-500/10
              dark:hover:text-red-300

              transition-colors
            "
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

// ============================================================
// PASSWORD FIELD
// ============================================================

function PasswordField({
  id,
  label,
  value,
  setValue,
  visible,
  setVisible,
  autoComplete,
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="
          block
          mb-2

          text-xs
          font-medium

          text-ink/60
        "
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete={autoComplete}
          className="
            w-full

            rounded-xl

            border
            border-ink/10
            dark:border-white/10

            bg-white
            dark:bg-[#202522]

            px-4
            py-3

            pr-11

            text-sm
            text-ink

            outline-none

            focus:border-teal

            transition-colors
          "
        />

        <button
          type="button"
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          onClick={() => setVisible((current) => !current)}
          className="
            absolute

            right-3
            top-1/2

            -translate-y-1/2

            text-ink/45

            hover:text-teal

            transition-colors
          "
        >
          {visible ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
