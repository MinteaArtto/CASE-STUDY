// src/components/ProductCarousel.jsx
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PRODUCTS = [
  { name: "Tomato", price: "$2.50", trend: "+4%", risk: "Low" },
  { name: "Banana", price: "$1.20", trend: "-2%", risk: "High" },
  { name: "Apple", price: "$3.00", trend: "+1%", risk: "Medium" },
  { name: "Lettuce", price: "$1.80", trend: "+7%", risk: "Low" },
];

export default function ProductCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
        <div className="flex">
          {PRODUCTS.map((product) => (
            <div
              key={product.name}
              className="flex-[0_0_100%] min-w-0 bg-white/70 p-6 border border-ink/10 rounded-2xl"
            >
              <h4 className="font-display font-bold text-xl">{product.name}</h4>
              <p className="text-2xl font-bold mt-2">{product.price}</p>
              <div className="flex gap-4 mt-3 text-sm">
                <span className={product.trend.startsWith("+") ? "text-green-600" : "text-red-600"}>
                  {product.trend}
                </span>
                <span className={product.risk === "High" ? "text-red-600 font-medium" : "text-ink/60"}>
                  Risk: {product.risk}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={() => emblaApi?.scrollPrev()}
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-md hover:bg-white transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => emblaApi?.scrollNext()}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-md hover:bg-white transition-colors"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}