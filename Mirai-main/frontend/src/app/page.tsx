"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Code2, Cpu, Globe, Rocket } from "lucide-react";

const roles = ["Backend Engineer", "Frontend Dev", "ML Engineer", "DevOps Engineer"];

export default function LandingPage() {
  const [roleIndex, setRoleIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setRoleIndex((prev) => (prev + 1) % roles.length);
        setIsFading(false);
      }, 500); // Wait for fade out
    }, 2500); // 2s display + 0.5s transition
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col w-full overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] bg-dark flex flex-col justify-center items-center px-6 text-center overflow-hidden">
        {/* CSS Grid Background */}
        <div 
          className="absolute inset-0 z-0" 
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
        
        {/* Radial Green Glow */}
        <div 
          className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full z-0 opacity-40 blur-[120px]"
          style={{
            background: 'radial-gradient(circle at top right, rgba(26,107,60,0.15), transparent 70%)'
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto animate-fade-up">
          <h1 className="text-4xl md:text-7xl font-syne font-bold text-white leading-tight">
            You are a <br className="md:hidden" />
            <span 
              className={`inline-block border-b-4 border-action text-action transition-opacity duration-500 ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'}`}
              style={{ minWidth: '320px' }}
            >
              [{roles[roleIndex]}]
            </span>
            <br />
            You just don't know it yet.
          </h1>
          
          <p className="mt-8 text-lg md:text-xl text-neutral-400 font-dm-sans max-w-2xl mx-auto">
            Nirmaan identifies your latent engineering DNA through project scans and skill quizzes, then bridges the gap to your next big role.
          </p>

          <Link href="/login" className="mt-12 inline-flex items-center gap-2 bg-action text-dark px-8 py-4 rounded-full font-syne font-bold text-lg hover:scale-105 transition-all shadow-lg hover:shadow-action/20">
            Get Started <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="bg-dark-surface py-24 px-6 relative border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="text-3xl md:text-5xl font-syne font-bold text-white mb-4">How it works</h2>
            <div className="w-20 h-1 bg-action rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {/* Step 1 */}
            <div className="relative group animate-fade-up" style={{ animationDelay: '0.1s' }}>
              <span className="absolute -top-12 -left-4 text-9xl font-syne font-black text-white opacity-[0.03] select-none group-hover:opacity-5 transition-opacity">01</span>
              <div className="p-8 rounded-2xl bg-dark border border-white/10 hover:border-action/30 transition-colors relative z-10">
                <div className="w-14 h-14 bg-primary/20 rounded-xl flex items-center justify-center mb-6 text-action">
                  <Globe className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-syne font-bold text-white mb-4">Import Data</h3>
                <p className="text-neutral-400 font-dm-sans leading-relaxed">
                  Connect your GitHub, upload your resume, or take our manual quiz. We look beyond keywords to find your true potential.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative group animate-fade-up" style={{ animationDelay: '0.3s' }}>
              <span className="absolute -top-12 -left-4 text-9xl font-syne font-black text-white opacity-[0.03] select-none group-hover:opacity-5 transition-opacity">02</span>
              <div className="p-8 rounded-2xl bg-dark border border-white/10 hover:border-action/30 transition-colors relative z-10">
                <div className="w-14 h-14 bg-primary/20 rounded-xl flex items-center justify-center mb-6 text-action">
                  <Cpu className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-syne font-bold text-white mb-4">GenAI Analysis</h3>
                <p className="text-neutral-400 font-dm-sans leading-relaxed">
                  Our neural engine analyzes your code patterns, project architecture choices, and logic flow to map your "Skill DNA".
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative group animate-fade-up" style={{ animationDelay: '0.5s' }}>
              <span className="absolute -top-12 -left-4 text-9xl font-syne font-black text-white opacity-[0.03] select-none group-hover:opacity-5 transition-opacity">03</span>
              <div className="p-8 rounded-2xl bg-dark border border-white/10 hover:border-action/30 transition-colors relative z-10">
                <div className="w-14 h-14 bg-primary/20 rounded-xl flex items-center justify-center mb-6 text-action">
                  <Rocket className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-syne font-bold text-white mb-4">Match & Grow</h3>
                <p className="text-neutral-400 font-dm-sans leading-relaxed">
                  Get a detailed profile of your engineering persona and personalized roadmap to land roles that fit your natural style.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Placeholder for visual completeness */}
      <footer className="bg-dark text-neutral-500 py-12 px-6 text-center text-sm border-t border-white/5">
        <p>© 2026 Nirmaan Platform. Built by Agent B with Premium Aesthetics.</p>
      </footer>
    </div>
  );
}
