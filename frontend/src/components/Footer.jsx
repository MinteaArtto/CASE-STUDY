const SOCIALS = [
  {
    label: "Instagram",
    Icon: (props) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    Icon: (props) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
        <path d="M10 9h4v2a4 4 0 0 1 4-2c3 0 4 2 4 5v8h-4v-7c0-1.5-.5-2.5-2-2.5s-2 1-2 2.5v7h-4V9z" />
      </svg>
    ),
  },
  {
    label: "X",
    Icon: (props) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
        <path d="M4 4l16 16M20 4L4 20" />
      </svg>
    ),
  },
];

const COLUMNS = [
  { heading: "Features", links: ["Forecast", "Classifier", "Recommendation"] },
  { heading: "About", links: ["Methodology", "Objectives", "Our team"] },
  { heading: "Support", links: ["Contact", "FAQ"] },
];

export default function Footer() {
  return (
    <footer className="bg-cream-light px-6 py-16 border-t border-ink/10">
      <div className="max-w-6xl mx-auto grid md:grid-cols-[1.3fr_1fr_1fr_1fr] gap-10">
        <div>
          <h3 className="font-display font-bold text-lg">MAMAV</h3>
          <p className="text-sm text-ink/60 mt-3 max-w-xs leading-relaxed">
            A predictive analytics system for market price forecasting and
            spoilage classification of perishable goods.
          </p>
          <div className="flex gap-4 mt-6 text-ink/60">
            {SOCIALS.map(({ Icon, label }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="hover:text-ink transition-colors"
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </a>
            ))}
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <h4 className="font-display font-bold text-sm mb-3">{col.heading}</h4>
            <ul className="space-y-2 text-sm text-ink/60">
              {col.links.map((link) => (
                <li
                  key={link}
                  className="hover:text-ink transition-colors cursor-pointer"
                >
                  {link}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
