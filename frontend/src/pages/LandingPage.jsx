import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import ClassifySection from "../components/ClassifySection";
import ActionCards from "../components/ActionCards";
import CTASection from "../components/CTASection";
import Footer from "../components/Footer";

export default function LandingPage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <ClassifySection />
      <ActionCards />
      <CTASection />
      <Footer />
    </main>
  );
}