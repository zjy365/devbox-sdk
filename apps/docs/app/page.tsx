import { AnimatedSection } from '@/components/landing/animated-section'
import { BentoSection } from '@/components/landing/bento-section'
import { Footer } from '@/components/landing/footer'
import { Header } from '@/components/landing/header'
import { HeroSection } from '@/components/landing/hero-section'
import { SocialProof } from '@/components/landing/social-proof'
import { UseCases } from '@/components/landing/use-cases'

export default function HomePage() {
  return (
    <main className="landing-page flex flex-col min-h-screen overflow-hidden">
      <Header />
      <HeroSection />

      <AnimatedSection delay={0.1}>
        <SocialProof />
      </AnimatedSection>

      <AnimatedSection className="relative z-10 mt-8 md:mt-16" delay={0.2}>
        <BentoSection />
      </AnimatedSection>

      <AnimatedSection className="relative z-10 mt-8 md:mt-16" delay={0.2}>
        <UseCases />
      </AnimatedSection>

      <Footer />
    </main>
  )
}
