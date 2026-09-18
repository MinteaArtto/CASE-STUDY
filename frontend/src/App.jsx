import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import Classifier from "./pages/Classifier";
import Forecast from "./pages/Forecast";
import About from "./pages/About";

import Header from "./components/Header";
import Footer from "./components/Footer";

import AdminPriceUpdate from "./pages/AdminPriceUpdate";

import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

// ============================================================
// GET STORED USER
// ============================================================

function getStoredUser() {
  const storedUser = window.localStorage.getItem("mamav_user");

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch (error) {
    console.error("Could not parse stored user:", error);

    return null;
  }
}

// ============================================================
// USER ROUTE
// ============================================================

function UserRoute({ children }) {
  const token = window.localStorage.getItem("mamav_token");
  const user = getStoredUser();

  if (!token || !user) {
    return <Navigate to="/" replace />;
  }

  if (user.role === "admin") {
    return <Navigate to="/admin/price-update" replace />;
  }

  return children;
}

// ============================================================
// ADMIN ROUTE
// ============================================================

function AdminRoute({ children }) {
  const token = window.localStorage.getItem("mamav_token");
  const user = getStoredUser();

  if (!token || !user) {
    return <Navigate to="/" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/forecast" replace />;
  }

  return children;
}

// ============================================================
// ABOUT PAGE LAYOUT
// ============================================================

function AboutPage() {
  return (
    <>
      <Header />
      <About />
      <Footer />
    </>
  );
}

// ============================================================
// APP
// ============================================================

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ====================================================
            PUBLIC ROUTES
            ==================================================== */}

        <Route path="/" element={<LandingPage />} />

        <Route path="/about" element={<AboutPage />} />

        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* ====================================================
            NORMAL USER ROUTES
            ==================================================== */}

        <Route
          path="/forecast"
          element={
            <UserRoute>
              <Forecast />
            </UserRoute>
          }
        />

        <Route
          path="/classifier"
          element={
            <UserRoute>
              <Classifier />
            </UserRoute>
          }
        />

        {/* ====================================================
            ADMIN ROUTES
            ==================================================== */}

        <Route
          path="/admin/price-update"
          element={
            <AdminRoute>
              <AdminPriceUpdate />
            </AdminRoute>
          }
        />

        {/* ====================================================
            UNKNOWN ROUTES
            ==================================================== */}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
