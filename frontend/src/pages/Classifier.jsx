import React, { useState, useRef, useEffect } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";

// Classifier page: upload an image, then press Analyze to call the backend.

export default function Classifier() {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewSrc && previewSrc.startsWith("blob:")) URL.revokeObjectURL(previewSrc);
    };
  }, [previewSrc]);

  async function analyzeImage(file) {
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("image", file);

      const res = await fetch(`${API_BASE}/api/spoilage/analyze`, {
        method: "POST",
        body: fd,
      });

      // Read body as text first to avoid "body stream already read" errors
      const bodyText = await res.text();
      let data = null;

      if (!res.ok) {
        // Try to parse JSON error message, otherwise use plain text
        try {
          const errJson = JSON.parse(bodyText);
          throw new Error(errJson.message || JSON.stringify(errJson));
        } catch (parseErr) {
          throw new Error(bodyText || res.statusText);
        }
      }

      try {
        data = JSON.parse(bodyText);
      } catch (parseErr) {
        // If response isn't JSON, fall back to empty object
        data = {};
      }

      // Expecting something like { prediction: 'Fresh'|'Rotten', confidence: 0.87 }
      let label = data.label || data.prediction || null;
      let confidence = null;
      if (typeof data.confidence === "number") confidence = data.confidence;
      else if (typeof data.confidence_score === "number") confidence = data.confidence_score;
      else if (data.scores && typeof data.scores[0] === "number") confidence = data.scores[0];

      // also include spoilageType and spoilageConfidence if present
      const spoilageType = data.spoilageType || data.labelName || data.spoilage_type || null;
      const spoilageConfidence =
        typeof data.spoilageConfidence === "number"
          ? data.spoilageConfidence
          : typeof data.spoilage_confidence === "number"
          ? data.spoilage_confidence
          : data.spoilageConfidence || null;

      setResult({ label, confidence, spoilageType, spoilageConfidence, raw: data });
    } catch (err) {
      console.error(err);
      setError(err.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  function onFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    // set a lightweight preview URL (optional) but do not auto-analyze
    const url = URL.createObjectURL(file);
    setPreviewSrc(url);
  }

  function clearImage() {
    setSelectedFile(null);
    setPreviewSrc(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = null;
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, var(--color-cream) 0%, #dff6ff 100%)' }} className="min-h-screen text-ink font-sans flex flex-col">
      <Header />

      <main className="max-w-5xl mx-auto px-6 py-16 flex-1">
        <section className="text-center">
          <h2 className="text-sm text-green-700 font-medium">Spoilage classifier</h2>
          <h1 className="mt-4 text-3xl md:text-4xl font-display font-bold">
            How is a product's condition classified?
          </h1>
          <p className="mt-3 text-ink/70 max-w-2xl mx-auto">
            Upload an image of the product. The system analyzes its visual
            condition and classifies it as Fresh or Rotten.
          </p>
        </section>

        <section className="mt-10 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-72 h-72 rounded-full bg-cream-light overflow-hidden flex items-center justify-center">
              <img src={previewSrc} alt="preview" className="w-full h-full object-cover" />
            </div>

            <label className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-ink text-cream-light px-4 py-2 rounded-full text-sm cursor-pointer hover:opacity-90">
              <input ref={inputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              Upload image
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => inputRef.current && inputRef.current.click()}
              className="px-4 py-2 rounded-md bg-cream text-ink border border-ink/10"
            >
              Choose file
            </button>
            <button
              onClick={() => {
                if (!selectedFile) {
                  setError("Please choose an image first.");
                  return;
                }
                analyzeImage(selectedFile);
              }}
              className="px-4 py-2 rounded-md bg-ink text-cream-light"
            >
              Analyze
            </button>
            <button onClick={clearImage} className="px-4 py-2 rounded-md bg-white border border-ink/10">
              Reset
            </button>
          </div>

          <div className="w-full">
            {loading && (
              <div className="text-center text-ink/60 py-4">Analyzing image...</div>
            )}

            {error && (
              <div className="text-center text-red-600 py-2">Error: {error}</div>
            )}

            {result && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-ink/5">
                    <div className="text-sm text-ink/70">Condition</div>
                    <div className={`mt-3 text-3xl md:text-4xl font-bold ${result.label === 'Rotten' ? 'text-red-700' : 'text-green-700'}`}>
                      {result.label || 'Unknown'}
                    </div>

                    <div className="mt-4">
                      <div className="text-sm text-ink/60 mb-2">Confidence</div>
                      <ProgressBar value={result.confidence} />
                      <div className="mt-2 text-sm text-ink/70">{typeof result.confidence === 'number' ? `${Math.round(result.confidence * 100)}%` : '—'}</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-ink/5 flex flex-col justify-between">
                    <div>
                      <div className="text-sm text-ink/70">Spoilage</div>
                      <div className="mt-3 text-2xl md:text-3xl font-semibold text-ink">{result.spoilageType || '—'}</div>
                    </div>

                    <div className="mt-6">
                      <div className="text-sm text-ink/60 mb-2">Spoilage confidence</div>
                      <ProgressBar value={result.spoilageConfidence} />
                      <div className="mt-2 text-sm text-ink/70">{typeof result.spoilageConfidence === 'number' ? `${Math.round(result.spoilageConfidence * 100)}%` : '—'}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-cream rounded-2xl p-6 shadow-sm border border-ink/5">
                  <h3 className="font-semibold">Recommendation</h3>
                  <p className="mt-2 text-ink/70">
                    {result.label === 'Rotten' ? (
                      'Inspect the product carefully and prioritize handling or removal of products showing visible spoilage.'
                    ) : result.label === 'Fresh' ? (
                      'Product appears fresh. Continue normal handling and storage procedures.'
                    ) : (
                      'No clear recommendation. Inspect the product manually.'
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function ProgressBar({ value }) {
  // value is 0..1 or null
  const pct = typeof value === 'number' ? Math.max(0, Math.min(1, value)) * 100 : 0;
  let color = 'bg-green-600';
  if (typeof value !== 'number') color = 'bg-ink/20';
  else if (pct < 40) color = 'bg-red-600';
  else if (pct < 75) color = 'bg-yellow-500';
  else color = 'bg-green-600';

  return (
    <div className="w-full bg-cream-light rounded-full h-3 overflow-hidden">
      <div className={`${color} h-3`} style={{ width: `${pct}%`, transition: 'width 400ms ease' }} />
    </div>
  );
}
