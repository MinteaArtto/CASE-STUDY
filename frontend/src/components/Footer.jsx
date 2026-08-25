const SOCIALS = ["Instagram", "LinkedIn", "X"];

const COLUMNS = [
  {
    heading: "Features",
    links: ["Forecast", "Classifier", "Recommendation"],
  },
  {
    heading: "About",
    links: ["Methodology", "Objectives", "Our team"],
  },
  {
    heading: "Support",
    links: ["Contact", "FAQ"],
  },
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
          <div className="flex gap-4 mt-6 text-sm text-ink/60">
            {SOCIALS.map((label) => (
              <a key={label} href="#" className="hover:text-ink transition-colors">
                {label}
              </a>
            ))}
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <h4 className="font-display font-bold text-sm mb-3">
              {col.heading}
            </h4>
            <ul className="space-y-2 text-sm text-ink/60">
              {col.links.map((link) => (
                <li key={link} className="hover:text-ink transition-colors">
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