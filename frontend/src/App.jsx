import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";

function Placeholder({ label }) {
  return (
    <div className="min-h-screen flex items-center justify-center font-display text-2xl text-ink bg-cream-light">
      {label} page — coming soon
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/forecast" element={<Placeholder label="Forecast" />} />
        <Route path="/classifier" element={<Placeholder label="Classifier" />} />
        <Route path="/recommendation" element={<Placeholder label="Recommendation" />} />
        <Route path="/about" element={<Placeholder label="About" />} />
      </Routes>
    </BrowserRouter>
  );
}