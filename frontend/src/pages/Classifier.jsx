import { useState, useRef, useEffect } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import recipeIndex from "../data/recipeIndex.json";

// Classifier page: upload an image, then press Analyze to call the backend.

export default function Classifier() {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewSrc && previewSrc.startsWith("blob:")) URL.revokeObjectURL(previewSrc);
    };
  }, [previewSrc]);

  useEffect(() => {
    if (!cameraOpen) return undefined;

    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not available in this browser. Use HTTPS or localhost, or choose an image file.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (cameraException) {
        if (cancelled) return;
        if (cameraException.name === "NotAllowedError" || cameraException.name === "PermissionDeniedError") {
          setCameraError("Camera permission was denied. Allow camera access in your browser settings, or choose an image file.");
        } else if (cameraException.name === "NotFoundError" || cameraException.name === "DevicesNotFoundError") {
          setCameraError("No camera was found on this device. Choose an image file instead.");
        } else {
          setCameraError(cameraException.message || "Unable to access the camera. Choose an image file instead.");
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOpen]);

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

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("The analysis service returned an invalid response.");
      }

      if (!res.ok || data.success !== true) {
        throw new Error(data.message || `Analysis failed (${res.status}).`);
      }
      if (!Array.isArray(data.detections)) {
        throw new Error(
          "The analysis service returned an unexpected result. Restart the backend and try again.",
        );
      }

      setResult(data);
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
    setPreviewSrc(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setCameraOpen(false);
    e.target.value = "";
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("The camera is still starting. Please try again in a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("The photo could not be captured. Please try again.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("The photo could not be captured. Please try again.");
        return;
      }

      const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      setSelectedFile(file);
      setPreviewSrc(URL.createObjectURL(file));
      setResult(null);
      setError(null);
      setCameraOpen(false);
    }, "image/jpeg", 0.92);
  }

  function openCamera() {
    setCameraError(null);
    setCameraReady(false);
    setCameraOpen(true);
  }

  function clearImage() {
    setSelectedFile(null);
    setPreviewSrc(null);
    setResult(null);
    setError(null);
    setCameraError(null);
    setCameraOpen(false);
    setCameraReady(false);
    if (inputRef.current) inputRef.current.value = null;
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, var(--color-cream) 0%, #dff6ff 100%)' }} className="min-h-screen text-ink font-sans flex flex-col">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-16 flex-1">
        <section className="text-center">
          <h2 className="text-sm text-green-700 font-medium">Produce classifier</h2>
          <h1 className="mt-4 text-3xl md:text-4xl font-display font-bold">
            Identify produce and assess its condition
          </h1>
          <p className="mt-3 text-ink/70 max-w-2xl mx-auto">
            Upload a clear image. The detector identifies fruit and vegetables,
            then assesses freshness and supported fruit ripeness.
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

          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => inputRef.current && inputRef.current.click()}
              className="px-4 py-2 rounded-md bg-cream text-ink border border-ink/10"
            >
              Choose file
            </button>
            <button
              onClick={openCamera}
              className="px-4 py-2 rounded-md bg-cream text-ink border border-ink/10"
            >
              Take photo
            </button>
            <button
              onClick={() => {
                if (!selectedFile) {
                  setError("Please choose an image first.");
                  return;
                }
                analyzeImage(selectedFile);
              }}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-ink text-cream-light"
            >
              {loading ? "Analyzing..." : "Analyze"}
            </button>
            <button onClick={clearImage} className="px-4 py-2 rounded-md bg-white border border-ink/10">
              Reset
            </button>
          </div>

          {cameraOpen && (
            <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-sm border border-ink/10">
              <div className="flex items-center justify-between gap-4 mb-3">
                <h2 className="font-semibold">Take a product photo</h2>
                <button
                  type="button"
                  onClick={() => setCameraOpen(false)}
                  className="px-3 py-1 rounded-md border border-ink/10 text-sm"
                >
                  Close camera
                </button>
              </div>
              {cameraError ? (
                <p role="alert" className="text-sm text-red-600 py-4">{cameraError}</p>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    onLoadedMetadata={() => setCameraReady(true)}
                    className="w-full max-h-96 rounded-xl bg-ink object-contain"
                    aria-label="Live camera preview"
                  />
                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={!cameraReady}
                    className="mt-4 w-full px-4 py-2 rounded-md bg-ink text-cream-light disabled:opacity-50"
                  >
                    {cameraReady ? "Capture photo" : "Starting camera..."}
                  </button>
                </>
              )}
            </div>
          )}

          <section
            className="w-full min-h-40 rounded-2xl bg-white p-5 shadow-sm border border-ink/5"
            aria-live="polite"
          >
            <h2 className="font-semibold">Analysis results</h2>
            <div className="mt-4">
              {loading && (
                <div role="status" className="flex items-center justify-center gap-3 py-8 text-ink/60">
                  <span
                    className="h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink"
                    aria-hidden="true"
                  />
                  <span>Analyzing image. Your results will appear here.</span>
                </div>
              )}

              {error && (
                <div role="alert" className="py-2 text-red-600">
                  Analysis failed: {error}
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {result.status === "rejected_illustration" ? (
                    <div className="rounded-2xl bg-white p-6 text-center shadow-sm border border-ink/5">
                      <h3 className="font-semibold">Please upload a real produce photo</h3>
                      <p className="mt-2 text-ink/70">{result.message}</p>
                      <div className="mx-auto mt-4 max-w-sm text-left">
                        <ScoreCard
                          title="Experimental illustration check"
                          label={result.imageValidation.label}
                          score={result.imageValidation.score}
                          detail="This pilot filter is not definitive and can make mistakes."
                        />
                      </div>
                    </div>
                  ) : result.status === "no_detections" ? (
                    <div className="rounded-2xl bg-white p-6 text-center shadow-sm border border-ink/5">
                      <h3 className="font-semibold">No produce detected</h3>
                      <p className="mt-2 text-ink/70">{result.message}</p>
                      {result.imageValidation && (
                        <div className="mx-auto mt-4 max-w-sm text-left">
                          <ScoreCard
                            title="Experimental image check"
                            label={result.imageValidation.label}
                            score={result.imageValidation.score}
                            detail="This pilot filter can make mistakes."
                          />
                        </div>
                      )}
                      <p className="mt-2 text-sm text-ink/60">
                        Try a closer, well-lit image with the produce unobstructed.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)] gap-4 items-start">
                        <div className="min-w-0 space-y-4">
                          <div className="rounded-2xl bg-white p-5 shadow-sm border border-ink/5">
                            <h3 className="font-semibold">{result.message}</h3>
                            <p className="mt-1 text-sm text-ink/60">
                              Scores are model outputs, not guarantees of correctness or food safety.
                              The illustration filter is an experimental pilot.
                            </p>
                          </div>

                          {result.imageValidation && (
                            <ScoreCard
                              title="Experimental image check"
                              label={result.imageValidation.label}
                              score={result.imageValidation.score}
                              detail="Pilot filter; not a definitive photo-authenticity check."
                            />
                          )}

                          {result.detections.map((detection, index) => (
                            <DetectionResult
                              key={`${detection.produce.classId}-${index}`}
                              detection={detection}
                              index={index}
                            />
                          ))}

                        </div>

                        <div className="space-y-4 lg:sticky lg:top-6">
                          <PriceSuggestionPanel
                            detections={result.detections}
                            apiBase={API_BASE}
                          />
                          <RecipeSupportPanel detections={result.detections} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {!loading && !error && !result && (
                <p className="py-8 text-center text-ink/60">
                  Choose or take a produce photo, then select Analyze. The evaluation will appear here.
                </p>
              )}
            </div>
          </section>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function PriceSuggestionPanel({ detections, apiBase }) {
  const [suggestions, setSuggestions] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSuggestions() {
      const candidates = detections.flatMap((detection, detectionIndex) =>
        candidatesForDetection(detection).map((candidate, candidateIndex) => ({
          key: `${detectionIndex}-${candidateIndex}`,
          candidate,
        })),
      );
      setSuggestions({});
      setError(null);
      if (candidates.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const productsResponse = await fetch(`${apiBase}/api/prices/products`);
        const productsData = await productsResponse.json();
        if (
          !productsResponse.ok ||
          productsData.success !== true ||
          !Array.isArray(productsData.products)
        ) {
          throw new Error(
            productsData.message || "Could not load forecastable produce prices.",
          );
        }

        const products = productsData.products.filter((product) =>
          isFruitOrVegetableCategory(product.category),
        );
        const matchedCandidates = candidates.map(({ key, candidate }) => ({
          key,
          candidate,
          product: findPriceProduct(candidate.produce?.label, products),
        }));
        const uniqueProducts = [
          ...new Map(
            matchedCandidates
              .filter(({ product }) => product)
              .map(({ product }) => [product.series_key, product]),
          ).values(),
        ];
        const forecastEntries = [];
        for (let index = 0; index < uniqueProducts.length; index += 3) {
          const batch = uniqueProducts.slice(index, index + 3);
          forecastEntries.push(
            ...(await Promise.all(
              batch.map((product) => fetchProductForecast(product, apiBase)),
            )),
          );
        }
        const forecastsBySeries = new Map(forecastEntries);
        const nextSuggestions = Object.fromEntries(
          candidates.map(({ key }) => {
            const match = matchedCandidates.find((item) => item.key === key);
            if (!match?.product) {
              return [key, { unavailableReason: "No matching weekly price series was found." }];
            }

            return [key, forecastsBySeries.get(match.product.series_key)];
          }),
        );

        if (!cancelled) setSuggestions(nextSuggestions);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Could not load price suggestions.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, [apiBase, detections]);

  const candidates = detections.flatMap((detection, detectionIndex) =>
    candidatesForDetection(detection).map((candidate, candidateIndex) => ({
      key: `${detectionIndex}-${candidateIndex}`,
      itemNumber: detectionIndex + 1,
      candidate,
    })),
  );

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-sm border border-ink/5">
      <h3 className="text-lg font-semibold">Suggested produce prices</h3>
      <p className="mt-1 text-sm text-ink/60">
        Suggestions use the 1-week DA price forecast and the detected ripeness.
        Prices are estimates per listed unit.
      </p>

      {loading && (
        <p role="status" className="mt-4 text-sm text-ink/60">
          Loading weekly price suggestions...
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Price suggestions unavailable: {error}
        </p>
      )}

      <div className="mt-4 space-y-4">
        {candidates.map(({ key, itemNumber, candidate }) => {
          const suggestion = suggestions[key];
          const canApplyDiscount = canSuggestPrice(candidate);
          const discount = canApplyDiscount
            ? discountForRipeness(candidate.ripeness?.label)
            : null;
          const suggestedPrice =
            suggestion?.forecastPrice !== undefined && discount !== null
              ? suggestion.forecastPrice * (1 - discount / 100)
              : null;

          return (
            <section
              key={key}
              className="rounded-xl border border-ink/10 p-4"
            >
              <h4 className="font-semibold">
                Item {itemNumber}: {candidate.produce?.label || "Detected produce"}
              </h4>
              {suggestion?.forecastPrice !== undefined ? (
                <>
                  <p className="mt-2 text-sm text-ink/60">
                    Matched DA series: {suggestion.product.commodity}
                    {suggestion.product.specification
                      ? ` · ${suggestion.product.specification}`
                      : ""}
                  </p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink/60">1-week forecast</dt>
                      <dd className="font-medium">
                        {formatPrice(suggestion.forecastPrice, suggestion.currency)}
                        {suggestion.product.unit ? ` / ${suggestion.product.unit}` : ""}
                      </dd>
                    </div>
                    {canApplyDiscount ? (
                      <>
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink/60">
                            {candidate.ripeness.label} discount
                          </dt>
                          <dd className="font-medium">{discount}%</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-ink/10 pt-2">
                          <dt className="font-semibold">Suggested price</dt>
                          <dd className="font-semibold text-green-800">
                            {formatPrice(suggestedPrice, suggestion.currency)}
                            {suggestion.product.unit ? ` / ${suggestion.product.unit}` : ""}
                          </dd>
                        </div>
                      </>
                    ) : (
                      <p className="border-t border-ink/10 pt-2 text-sm text-ink/60">
                        {priceDisplayReason(candidate)}
                      </p>
                    )}
                  </dl>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink/60">
                  {suggestion?.error ||
                    suggestion?.unavailableReason ||
                    (error
                      ? "Price suggestion could not be loaded."
                      : loading
                        ? "Checking the weekly forecast..."
                        : "Price suggestion unavailable.")}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function candidatesForDetection(detection) {
  return detection.candidates?.length ? detection.candidates : [detection];
}

function canSuggestPrice(candidate) {
  return (
    candidate.freshness?.label === "Fresh" &&
    candidate.ripeness?.status === "classified" &&
    discountForRipeness(candidate.ripeness?.label) !== null
  );
}

function priceDisplayReason(candidate) {
  if (candidate.freshness?.label === "Rotten") {
    return "Forecast shown for reference only; no sale suggestion for an item classified as rotten.";
  }
  if (candidate.freshness?.label !== "Fresh") {
    return "Forecast shown for reference only; discount not applied because freshness is not classified as Fresh.";
  }
  return "Forecast shown for reference only; discount not applied because ripeness was not assessed.";
}

function discountForRipeness(label) {
  if (label === "Ripe") return 0;
  if (label === "Unripe") return 10;
  if (label === "Overripe") return 30;
  if (label === "Semi-ripe" || label === "Turning") return 20;
  return null;
}

function isFruitOrVegetableCategory(category) {
  return [
    "CORN",
    "FRUIT VEGETABLES",
    "FRUITS",
    "HIGHLAND VEGETABLES",
    "LOWLAND VEGETABLES",
    "LEAFY VEGETABLES",
  ].includes((category || "").trim().toUpperCase());
}

function findPriceProduct(label, products) {
  const names = productNameVariants(label);
  const matches = products
    .map((product) => {
      const commodity = normalizeProductName(product.commodity);
      const score = Math.max(
        ...names.map((name) => {
          if (commodity === name) return 3;
          if (commodity.startsWith(`${name} `)) return 2;
          if (` ${commodity} `.includes(` ${name} `)) return 1;
          return 0;
        }),
      );
      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.product.record_count || 0) - (left.product.record_count || 0),
    );

  return matches[0]?.product || null;
}

function productNameVariants(label) {
  const names = (label || "")
    .split(/[()]/)
    .map(normalizeProductName)
    .filter(Boolean);
  const aliases = {
    "bitter gourd": "ampalaya",
    "sugar apple": "atis",
    "star apple": "caimito",
    soursop: "guyabano",
    tomato: "kamatis",
    "water spinach": "kangkong",
    tamarind: "sampalok",
    cabbage: "repolyo",
    chayote: "sayote",
    "yardlong bean": "sitaw",
    eggplant: "talong",
    "bottle gourd": "upo",
  };
  return [...new Set(names.flatMap((name) => [name, aliases[name]].filter(Boolean)))];
}

function normalizeProductName(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatPrice(value, currency) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
  }).format(value);
}

async function fetchProductForecast(product, apiBase) {
  try {
    const response = await fetch(`${apiBase}/api/prices/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesKey: product.series_key }),
    });
    const data = await response.json();
    if (!response.ok || data.success !== true || !data.forecast) {
      throw new Error(data.message || "Could not load the price forecast.");
    }

    const forecastPrice = Number(data.forecast.forecasts?.["1w"]?.predicted_price);
    if (!Number.isFinite(forecastPrice) || forecastPrice <= 0) {
      throw new Error("The 1-week forecast price is unavailable.");
    }

    return [
      product.series_key,
      {
        product,
        forecastPrice,
        currency: data.forecast.currency || product.currency || "PHP",
      },
    ];
  } catch (forecastError) {
    return [
      product.series_key,
      {
        product,
        error: forecastError.message || "Could not load the price forecast.",
      },
    ];
  }
}

function RecipeSupportPanel({ detections }) {
  return (
    <aside className="rounded-2xl bg-white p-5 shadow-sm border border-ink/5 lg:sticky lg:top-6">
      <h3 className="text-lg font-semibold">Recipe decision support</h3>
      <p className="mt-1 text-sm text-ink/60">
        Suggested recipes that match this produce based on its freshness and ripeness.
        Check the item first; the classification can only detect its condition based on its visual look.
      </p>

      <div className="mt-4 space-y-5">
        {detections.flatMap((detection, index) => {
          const candidates = detection.candidates?.length
            ? detection.candidates
            : [detection];
          return candidates.map((candidate, candidateIndex) => {
            const label = candidate.produce?.label || "Detected produce";
            const recipesForProduce = recipeIndex[recipeKeyForLabel(label)];
            const freshness = candidate.freshness?.label;
            const ripeness = candidate.ripeness?.label;
            const overripeRecipes = ripeness === "Overripe"
              ? recipesForProduce?.overripe
              : null;
            const recipes = overripeRecipes?.length
              ? overripeRecipes
              : recipesForProduce?.recipes || [];

            return (
              <section
                key={`${index}-${candidate.produce?.classId ?? label}-${candidateIndex}`}
                className="border-t border-ink/10 pt-4 first:border-0 first:pt-0"
              >
                <h4 className="font-semibold">
                  Item {index + 1} possibility: {label}
                </h4>
                <p className="mt-1 text-sm text-ink/60">
                  Freshness: {freshness || "Not assessed"}
                  {formatPercentage(candidate.freshness?.score)
                    ? ` (${formatPercentage(candidate.freshness.score)})`
                    : ""}
                  {ripeness
                    ? ` · Ripeness: ${ripeness}${
                        formatPercentage(candidate.ripeness?.score)
                          ? ` (${formatPercentage(candidate.ripeness.score)})`
                          : ""
                      }`
                    : ""}
                </p>

                {freshness === "Rotten" ? (
                  <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                    No recipe ideas shown for this item. The classifier marked it as rotten;
                    do not use this image result alone to judge food safety.
                  </p>
                ) : (
                  <>
                    {freshness !== "Fresh" && (
                      <p className="mt-3 rounded-lg bg-cream p-3 text-sm text-ink/70">
                        Condition is uncertain. Check the item for spoilage signs before
                        considering any recipe.
                      </p>
                    )}
                    {ripeness === "Unripe" && (
                      <p className="mt-3 text-sm text-ink/70">
                        The item appears unripe. Allow it to ripen where appropriate;
                        these ingredient matches are not specific to unripe produce.
                      </p>
                    )}
                    {ripeness === "Overripe" && (
                      <p className="mt-3 text-sm text-ink/70">
                        If there are no spoilage signs, consider using it soon. These
                        matches specifically include very ripe or over-ripe ingredients.
                      </p>
                    )}

                    {recipes.length > 0 ? (
                      <ul className="mt-3 space-y-3">
                        {recipes.map((recipe) => (
                          <li key={`${recipe.title}-${recipe.ingredient}`} className="rounded-xl bg-cream-light p-3">
                            <div className="font-medium">{recipe.title}</div>
                            <div className="mt-1 text-xs text-ink/60">{recipe.category}</div>
                            <div className="mt-2 text-sm text-ink/70">
                              Ingredient: {recipe.ingredient}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-ink/60">
                        No matching recipe was found in the current dataset for this produce.
                      </p>
                    )}
                  </>
                )}
              </section>
            );
          });
        })}
      </div>
    </aside>
  );
}

function recipeKeyForLabel(label) {
  const normalized = label.toLowerCase();
  const aliases = [
    ["kangkong", ["kangkong", "water spinach"]],
    ["repolyo", ["repolyo", "cabbage"]],
    ["sayote", ["sayote", "chayote"]],
    ["sitaw", ["sitaw", "yardlong bean"]],
    ["talong", ["talong", "eggplant", "aubergine"]],
    ["upo", ["upo", "bottle gourd", "opo squash"]],
  ];

  for (const [key, names] of aliases) {
    if (names.some((name) => normalized.includes(name))) return key;
  }
  return normalized;
}

function DetectionResult({ detection, index }) {
  const candidates = detection.candidates?.length
    ? detection.candidates
    : [detection];

  return (
    <article className="rounded-2xl bg-white p-6 shadow-sm border border-ink/5">
      <h3 className="text-xl font-semibold">
        Item {index + 1}: possible identities
      </h3>
      <p className="mt-1 text-sm text-ink/60">
        Detector scores are model outputs and are not calibrated for direct comparison.
        Freshness is assessed on the same crop for each identity; ripeness depends on
        whether a model supports that produce. Recipe matches are listed from the dataset
        and do not have a model score.
      </p>

      <div className="mt-4 space-y-4">
        {candidates.map((candidate, candidateIndex) => (
          <section
            key={`${candidate.produce.classId}-${candidateIndex}`}
            className="rounded-xl border border-ink/10 p-4"
          >
            <h4 className="font-semibold">
              {candidate.produce.label}
              {candidateIndex === 0
                ? ` · ${detectorModelLabel(candidate.produce.detectorModel)} output`
                : ""}
            </h4>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(candidate.produce.modelScores || [{
                model: candidate.produce.detectorModel || "active",
                score: candidate.produce.confidence,
              }]).map((modelScore) => (
                <ScoreCard
                  key={modelScore.model}
                  title={`Produce match · ${detectorModelLabel(modelScore.model)}`}
                  label={candidate.produce.label}
                  score={modelScore.score}
                  detail="Detector score; not a calibrated probability."
                />
              ))}
              <ScoreCard
                title="Freshness"
                label={candidate.freshness.label}
                score={candidate.freshness.score}
                detail={candidate.freshness.message}
              />
              <ScoreCard
                title="Ripeness"
                label={candidate.ripeness.label || "Not assessed"}
                score={candidate.ripeness.score}
                detail={ripenessDetails(candidate.ripeness)}
              />
            </div>

            <div className="mt-4 rounded-xl bg-cream p-4">
              <h4 className="font-semibold">Recommended action</h4>
              <p className="mt-1 text-ink/70">{candidate.recommendation}</p>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function detectorModelLabel(model) {
  if (model === "tropical") return "48-class experimental candidate";
  if (model === "extended") return "35-class candidate";
  return "18-class model";
}

function ripenessDetails(ripeness) {
  const modelPredictions = ripeness.candidatePredictions;
  if (!modelPredictions) return ripeness.message;

  const candidateScores = Object.entries(modelPredictions)
    .map(([model, prediction]) => {
      const modelNames = {
        activeClassifier: "Existing ripeness model",
        imageClassifier: "Extension image classifier",
        newImageClassifier: "New experimental image classifier",
        tree: "Extension tree",
      };
      const modelName = modelNames[model] || "Ripeness candidate";
      return `${modelName}: ${prediction.label} (${formatPercentage(prediction.score) || "score unavailable"})`;
    })
    .join("; ");

  return [ripeness.message, candidateScores].filter(Boolean).join(" ");
}

function ScoreCard({ title, label, score, detail }) {
  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <div className="text-sm text-ink/60">{title}</div>
      <div className="mt-2 text-lg font-semibold">{label || "Unavailable"}</div>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm text-ink/70">
        <span>Model score</span>
        <span>{formatPercentage(score) || "Not available"}</span>
      </div>
      <div className="mt-2">
        <ProgressBar value={score} />
      </div>
      {detail && <p className="mt-2 text-sm text-ink/60">{detail}</p>}
    </div>
  );
}

function formatPercentage(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : null;
}

function ProgressBar({ value }) {
  const pct = typeof value === "number" ? Math.max(0, Math.min(1, value)) * 100 : 0;
  let color = "bg-green-600";
  if (typeof value !== "number") color = "bg-ink/20";
  else if (pct < 40) color = "bg-red-600";
  else if (pct < 75) color = "bg-yellow-500";

  return (
    <div className="w-full bg-cream-light rounded-full h-3 overflow-hidden">
      <div className={`${color} h-3`} style={{ width: `${pct}%`, transition: 'width 400ms ease' }} />
    </div>
  );
}
