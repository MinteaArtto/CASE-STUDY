import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Bell, CircleHelp, LockKeyhole, X } from "lucide-react";

const OVERVIEW_CARDS = [
  { label: "Forecast activity", value: "12", detail: "placeholder analyses this month" },
  { label: "Saved products", value: "08", detail: "placeholder items in your workspace" },
  { label: "Latest update", value: "Today", detail: "your dashboard is up to date" },
];

export default function User({ onClose, user, onLogout }) {
  const displayName = user?.name || "User";
  const email = user?.email || "user@example.com";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] bg-ink/45 backdrop-blur-[2px] p-4 md:p-8 overflow-y-auto"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-dashboard-title"
        className="relative max-w-5xl mx-auto my-4 md:my-8 rounded-3xl bg-cream-light shadow-2xl overflow-hidden"
      >
        <button
          type="button"
          aria-label="Close user profile"
          onClick={onClose}
          className="absolute top-5 right-5 z-10 w-9 h-9 rounded-full bg-white/80 text-ink/70 flex items-center justify-center hover:bg-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid lg:grid-cols-[220px_1fr]">
          <aside className="bg-ink text-cream-light p-6 md:p-8">
            <div className="flex lg:block items-center gap-4 pb-6 border-b border-cream-light/15">
              <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-teal to-mint flex items-center justify-center text-ink font-display font-bold text-xl">
                {initials}
              </div>
              <div className="mt-0 lg:mt-4">
                <p className="font-display font-bold">{displayName}</p>
                <p className="text-xs text-cream-light/60 mt-1">Personal account</p>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-sm">
              <div className="rounded-xl bg-cream-light/15 px-4 py-3">Overview</div>
              <div className="flex items-center gap-3 px-4 py-3 text-cream-light/60">
                <Bell className="w-4 h-4" />
                Notifications
              </div>
              <div className="flex items-center gap-3 px-4 py-3 text-cream-light/60">
                <LockKeyhole className="w-4 h-4" />
                Privacy &amp; security
              </div>
              <div className="flex items-center gap-3 px-4 py-3 text-cream-light/60">
                <CircleHelp className="w-4 h-4" />
                Help centre
              </div>
            </div>

            <p className="hidden lg:block mt-10 text-xs leading-relaxed text-cream-light/45">
              Settings are placeholders for now. More account controls will be
              available in a future update.
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-6 text-sm text-cream-light/70 hover:text-cream-light transition-colors"
            >
              Log out
            </button>
            <Link
              to="/dashboard"
              onClick={onClose}
              className="block mt-3 text-sm text-cream-light/70 hover:text-cream-light transition-colors"
            >
              Open dashboard
            </Link>
          </aside>

          <main className="p-6 md:p-10">
            <div className="pr-10 mb-8">
              <p className="text-sm text-teal font-medium">Your workspace</p>
              <h1 id="user-dashboard-title" className="font-display font-bold text-3xl md:text-4xl tracking-tight mt-2">
                Welcome back, {displayName}.
              </h1>
              <p className="text-ink/65 max-w-2xl mt-3 leading-relaxed">
                Your personal dashboard for market insights, saved products,
                and account activity.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {OVERVIEW_CARDS.map(({ label, value, detail }) => (
                <article key={label} className="bg-white/90 rounded-2xl p-4 border border-ink/5">
                  <p className="text-xs text-ink/55">{label}</p>
                  <p className="font-display font-bold text-2xl mt-3">{value}</p>
                  <p className="text-xs text-ink/50 mt-1">{detail}</p>
                </article>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <article className="bg-white/90 rounded-2xl p-5 border border-ink/5">
                <p className="text-sm text-teal font-medium">Profile</p>
                <h2 className="font-display font-bold text-xl mt-1">Personal details</h2>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-ink/10 pb-2">
                    <span className="text-ink/55">Name</span>
                    <span className="font-medium">{displayName}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-ink/10 pb-2">
                    <span className="text-ink/55">Email</span>
                    <span className="font-medium">{email}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-ink/55">Member since</span>
                    <span className="font-medium">January 2026</span>
                  </div>
                </div>
              </article>

              <article className="bg-mint/70 rounded-2xl p-5 border border-white/60">
                <p className="text-sm text-teal font-medium">Coming next</p>
                <h2 className="font-display font-bold text-xl mt-1">Your activity feed</h2>
                <p className="text-sm text-ink/65 leading-relaxed mt-3">
                  Recent forecasts, classification results, and saved
                  recommendations will appear here once connected.
                </p>
                <div className="mt-5 h-16 rounded-xl border border-dashed border-teal/35 flex items-center justify-center text-xs text-teal/70">
                  No activity to display yet
                </div>
              </article>
            </div>
          </main>
        </div>
      </section>
    </div>,
    document.body
  );
}
