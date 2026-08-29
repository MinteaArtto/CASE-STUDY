import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PRODUCTS = [
  { name: "Avocado", image: "/products/avocado.png", price: "₱50", change: "+1%" },
  { name: "Banana", image: "/products/banana.png", price: "₱48", change: "+1%" },
  { name: "Carrot", image: "/products/carrot.png", price: "₱35", change: "-2%" },
  { name: "Tomato", image: "/products/tomato.png", price: "₱42", change: "+4%" },
  { name: "Lettuce", image: "/products/lettuce.png", price: "₱30", change: "+3%" },
];

export default function ProductCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    slidesToScroll: 1,
  });

  return (
    <div className="relative flex items-center gap-3">
      <button
        onClick={() => emblaApi?.scrollPrev()}
        aria-label="Previous"
        className="shrink-0 p-2 rounded-full hover:bg-ink/5 transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-ink/60" />
      </button>

      <div className="overflow-hidden flex-1" ref={emblaRef}>
        <div className="flex gap-4">
          {PRODUCTS.map((product) => (
            <div
              key={product.name}
              className="flex-[0_0_calc(33.333%-11px)] min-w-0 bg-cream-light/70 rounded-2xl p-6 text-center flex flex-col items-center"
            >
              <img
                src={product.image}
                alt={product.name}
                className="w-16 h-16 object-contain mb-3"
              />
              <h4 className="font-display font-bold">{product.name}</h4>
              <p className="text-lg font-bold mt-1">
                {product.price}
                <span className="text-sm font-normal text-ink/50">/kg</span>
              </p>
              <span
                className={
                  "text-xs mt-1 " +
                  (product.change.startsWith("+") ? "text-teal" : "text-red-500")
                }
              >
                {product.change} this week
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => emblaApi?.scrollNext()}
        aria-label="Next"
        className="shrink-0 p-2 rounded-full hover:bg-ink/5 transition-colors"
      >
        <ChevronRight className="w-5 h-5 text-ink/60" />
      </button>
    </div>
  );
}