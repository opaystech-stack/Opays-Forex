import LandingNavbar from '../components/LandingNavbar';
import Hero from '../sections/Hero';
import Features from '../sections/Features';
import Pricing from '../sections/Pricing';
import CTA from '../sections/CTA';
import Footer from '../sections/Footer';

export default function Home() {
  return (
    <div className="landing-reset">
      <LandingNavbar />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <CTA />
        <Footer />
      </main>
    </div>
  );
}
