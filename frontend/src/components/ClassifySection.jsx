import { useRef, useState } from "react";
import { AlertCircle, Plus, X } from "lucide-react";

export default function ClassifySection() {
  const [image, setImage] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(URL.createObjectURL(file));
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <section className="bg-linear-to-b from-cream-light via-mint-light to-mint px-6 py-24 text-center">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-display font-bold text-4xl md:text-5xl tracking-wide text-white drop-shadow-sm">
          CLASSIFY YOUR GOODS
        </h2>

        <div className="relative w-72 h-72 mx-auto mt-12 mb-14 flex items-center justify-center">
          <img
            src="/products/fruit.png"
            alt="Tomato"
            className="relative w-64 h-64 object-contain drop-shadow-md"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={image ? "Change product photo" : "Upload a product photo"}
            className="absolute z-10 w-14 h-14 rounded-full bg-white/80 backdrop-blur-sm border border-ink/20 flex items-center justify-center hover:bg-white transition-colors overflow-hidden shadow-sm"
            style={{ top: "58%", left: "50%", transform: "translate(-50%, -50%)" }}
          >
            {image ? (
              <img
                src={image}
                alt="Uploaded product preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <Plus className="w-6 h-6 text-ink/70" strokeWidth={2} />
            )}
          </button>

          {image && (
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Remove uploaded photo"
              className="absolute z-10 w-6 h-6 rounded-full bg-ink text-cream-light flex items-center justify-center hover:bg-ink/80 transition-colors"
              style={{ top: "42%", left: "62%" }}
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        <h3 className="font-display font-bold text-2xl md:text-3xl leading-snug">
          What does the system detect from your product image?
        </h3>
        <p className="text-ink/70 mt-4 max-w-xl mx-auto leading-relaxed">
          Upload or capture a photo of a selected perishable good. MamaV uses
          a pretrained image classification API to identify visual spoilage
          indicators and return a corresponding label with a confidence
          score.
        </p>

        <div className="grid sm:grid-cols-2 gap-6 mt-12 text-left">
          <div className="bg-white/80 rounded-2xl p-6 border border-white/60">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center mb-4 font-display font-bold text-sm">
              N
            </div>
            <h4 className="font-display font-bold text-sm tracking-wide">
              NYCKEL TRAINED
            </h4>
            <p className="text-sm text-ink/60 mt-2 leading-relaxed">
              Uses a pretrained image classification API to identify visual
              spoilage indicators from a submitted product photo and provide
              a confidence score.
            </p>
          </div>

          <div className="bg-white/80 rounded-2xl p-6 border border-white/60">
            <div className="w-10 h-10 rounded-full border border-ink/30 flex items-center justify-center mb-4">
              <AlertCircle className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <h4 className="font-display font-bold text-sm tracking-wide">
              DECISION TREE CLASSIFICATION
            </h4>
            <p className="text-sm text-ink/60 mt-2 leading-relaxed">
              Uses selected product characteristics to classify the spoilage
              condition of the perishable good.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
