import Header from "../components/Header";
import Hero from "../components/Hero";
import ForecastSection from "../components/ForecastSection";
import ClassifySection from "../components/ClassifySection";
import ActionCards from "../components/ActionCards";
import CTASection from "../components/CTASection";
import Footer from "../components/Footer";

export default function LandingPage() {
  return (
    <>
      <Header />

      <main>
        <Hero />

        <ForecastSection />

        <ClassifySection />

        <ActionCards />

        <CTASection />
      </main>

      <Footer />
    </>
  );
}
