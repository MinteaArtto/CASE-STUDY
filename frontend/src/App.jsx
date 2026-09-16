import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import Classifier from "./pages/Classifier";
import Forecast from "./pages/Forecast";
import Header from "./components/Header";
import Footer from "./components/Footer";
import UserDashboard from "./pages/UserDashboard";

function Placeholder({ label }) {
  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center font-display text-2xl text-ink bg-cream-light">
        {label} page — coming soon
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/forecast" element={<Forecast />} />
        <Route path="/classifier" element={<Classifier />} />
        <Route path="/dashboard" element={<UserDashboard />} />
        <Route path="/about" element={<Placeholder label="About" />} />
      </Routes>
    </BrowserRouter>
  );
}