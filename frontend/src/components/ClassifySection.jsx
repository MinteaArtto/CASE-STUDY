// src/components/ClassifySection.jsx
import { TrendingUp, AlertTriangle, Package } from "lucide-react";

const FEATURES = [
  {
    icon: TrendingUp,
    title: "Price Forecasting",
    desc: "Predicts market prices using regression models to help you make informed selling decisions.",
  },
  {
    icon: AlertTriangle,
    title: "Spoilage Detection",
    desc: "Classifies spoilage risk using decision tree models to minimize waste and maximize profit.",
  },
  {
    icon: Package,
    title: "Inventory Insights",
    desc: "Get real-time recommendations on which batches to prioritize based on risk and demand.",
  },
];

export default function ClassifySection() {
  return (
    <section className="bg-cream-light px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-wide">
            Smart Classification for Better Decisions
          </h2>
          <p className="text-ink/70 mt-4 max-w-2xl mx-auto leading-relaxed">
            Our machine learning models analyze market trends and spoilage patterns
            to give you clear, actionable insights.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="bg-white/70 rounded-2xl p-8 border border-ink/5 text-center hover:shadow-lg transition-shadow"
            >
              <div className="w-14 h-14 bg-teal/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <Icon className="w-7 h-7 text-teal" strokeWidth={1.75} />
              </div>
              <h3 className="font-display font-bold text-lg">{title}</h3>
              <p className="text-sm text-ink/60 mt-3 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}