import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function UserForgotPassword({ onClose, onLogIn }) {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChanged, setIsChanged] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = (event) => {
    event.preventDefault();
    setIsChanged(true);
  };

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] bg-ink/45 backdrop-blur-[2px] p-4 flex items-center justify-center"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-password-title"
        className="relative w-full max-w-md rounded-3xl bg-cream-light p-6 md:p-8 shadow-2xl"
      >
        <button
          type="button"
          aria-label="Close forgot password"
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/80 text-ink/70 flex items-center justify-center hover:bg-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <p className="text-sm text-teal font-medium">Account recovery</p>
        <h1
          id="forgot-password-title"
          className="font-display font-bold text-3xl mt-2"
        >
          Change your password
        </h1>
        <p className="text-sm text-ink/65 mt-3">
          Enter your account email and choose a new password.
        </p>

        {isChanged ? (
          <div
            role="status"
            className="mt-6 rounded-2xl bg-mint/70 border border-teal/20 p-5 text-center"
          >
            <p className="font-display font-bold text-lg">Password changed</p>
            <p className="text-sm text-ink/65 mt-2">
              Your password was changed for {email}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Account email address
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-teal/40"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-sm font-medium">
              New password
              <input
                required
                minLength={6}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-teal/40"
                placeholder="Enter a new password"
              />
            </label>
            <label className="block text-sm font-medium">
              Confirm password
              <input
                required
                minLength={6}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-teal/40"
                placeholder="Confirm your new password"
              />
            </label>
            <button
              type="submit"
              disabled={newPassword !== confirmPassword}
              className="w-full rounded-full bg-ink px-5 py-3 text-sm font-medium text-cream-light hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Change password
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onLogIn}
          className="w-full mt-5 text-sm text-teal hover:text-teal-dark transition-colors"
        >
          Back to log in
        </button>
      </section>
    </div>,
    document.body,
  );
}