"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  ChevronDown, 
  HelpCircle,
  Play,
  Scale,
  MapPin,
  Shield,
  Users,
  Bot
} from "lucide-react";
import { GovNavbar } from "@/components/shell/gov-navbar";
import { LandServicesSection } from "@/components/landing/land-services-section";
import { useT, useLocale } from "@/lib/i18n/provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HERO_IMAGES = [
  "/landing/nature-paddy.png",
  "/landing/nature-river.png"
];

export default function LandingPage() {
  const t = useT();
  const landing = t.pages.landing;
  const { locale } = useLocale();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const statValues = ["64", "1.2M+", "45K+", "10M+"];
  const statKeys = ["districts", "users", "disputes", "khatians"];

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans relative">
      {/* Bangladesh Map Watermark */}
      <div className="fixed inset-0 z-0 pointer-events-none flex items-center justify-end pr-0 -mr-[15%] opacity-25 mix-blend-multiply drop-shadow-sm" aria-hidden="true">
        <div className="relative h-[120vh] w-[120vh] max-w-none">
          <Image 
            src="/landing/bd-map-shadow.png" 
            alt="Bangladesh Map Background" 
            fill 
            className="object-contain object-right grayscale saturate-50 contrast-125 scale-125"
          />
        </div>
      </div>
      {/* 1. Header & Navigation Bar */}
      <GovNavbar />

      {/* 2. Hero Section */}
      <section className="relative flex flex-col md:flex-row min-h-[500px]">
        {/* Left: Carousel */}
        <div className="relative flex-1 overflow-hidden h-[400px] md:h-auto">
          {HERO_IMAGES.map((src, index) => (
            <div 
              key={index} 
              className={`hero-slide ${index === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0"}`}
            >
              <div className="absolute inset-0 bg-black/40 z-10" />
              <Image 
                src={src} 
                alt={`Hero ${index}`} 
                fill 
                className={`object-cover transition-transform duration-[10000ms] ease-out ${index === currentSlide ? "scale-105" : "scale-100"}`}
                priority={index === 0}
              />
              <div className="absolute inset-0 z-20 flex flex-col justify-center p-8 md:p-12 lg:p-16">
                <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl text-balance drop-shadow-md">
                  {(landing as Record<string, any>)?.[`heroHeadline${index + 1}`] || landing?.heroHeadline1}
                </h1>
              </div>
            </div>
          ))}
          
          {/* Carousel dots */}
          <div className="absolute bottom-16 left-8 z-30 flex gap-2 md:left-12 lg:left-16">
            {HERO_IMAGES.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`h-2 w-8 rounded-full transition-all ${
                  index === currentSlide ? "bg-white" : "bg-white/40 hover:bg-white/60"
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          {/* Secondary Quick Links Bar */}
          <div className="absolute bottom-0 z-30 flex w-full flex-wrap divide-x divide-white/20 border-t border-white/20 bg-black/30 backdrop-blur-sm">
            {[
              { key: "quickLinkGuide", icon: Play },
              { key: "quickLinkMediator", icon: Scale },
              { key: "quickLinkFieldAgent", icon: MapPin },
              { key: "quickLinkPolicy", icon: Shield }
            ].map((link, i) => {
              const Icon = link.icon;
              return (
                <Link 
                  key={i} 
                  href="#" 
                  className="group flex flex-1 items-center justify-center gap-2 px-2 py-4 text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 transition-all duration-300 sm:text-sm whitespace-nowrap min-w-[150px] relative overflow-hidden"
                >
                  <div className="absolute inset-x-0 bottom-0 h-0.5 bg-green-400 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
                  <Icon className="h-4 w-4 opacity-70 group-hover:opacity-100 group-hover:-translate-y-0.5 transition-all duration-300" />
                  {(landing as Record<string, any>)?.[link.key]}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: Support Callout (Hotline Card) */}
        <div className="group flex w-full flex-col justify-center items-center relative overflow-hidden bg-white px-8 py-12 md:w-80 lg:w-96 lg:px-12 border-l border-slate-200 shrink-0 min-h-[400px] cursor-pointer hover:bg-green-50/30 transition-colors duration-500">
          {/* Smriti Soudho Watermark SVG */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.16] text-[#074726] scale-125 group-hover:scale-150 group-hover:opacity-20 transition-all duration-700 ease-in-out">
            <svg viewBox="0 0 200 160" className="w-full h-full max-w-[460px]">
              <g stroke="currentColor" strokeWidth="0.75" fill="none">
                <path d="M100 10 L94 140 L106 140 Z" fill="currentColor" fillOpacity="0.3" />
                <path d="M100 25 L84 140 L116 140 Z" fill="currentColor" fillOpacity="0.15" />
                <path d="M100 40 L70 140 L130 140 Z" />
                <path d="M100 55 L55 140 L145 140 Z" fill="currentColor" fillOpacity="0.08" />
                <path d="M100 70 L40 140 L160 140 Z" />
                <path d="M100 85 L25 140 L175 140 Z" fill="currentColor" fillOpacity="0.04" />
                <path d="M100 100 L10 140 L190 140 Z" />
                <line x1="5" y1="140" x2="195" y2="140" strokeWidth="1.5" />
                <line x1="100" y1="10" x2="100" y2="140" strokeWidth="1" opacity="0.5" />
              </g>
            </svg>
          </div>
          
          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <h3 className="text-[26px] md:text-3xl font-medium text-[#1c4532] tracking-tight mb-2 md:mb-3 group-hover:-translate-y-1 transition-transform duration-300">
              {locale === "bn" ? "ভূমিসেবা সহায়তার জন্য" : "For Land Service Help"}
            </h3>
            <p className="text-lg md:text-xl font-medium text-[#1c4532] mb-3 md:mb-4 group-hover:-translate-y-1 transition-transform duration-300 delay-75">
              {locale === "bn" ? "কল করুন" : "Call"}
            </p>
            <div className="text-[4rem] md:text-[5rem] leading-none font-bold text-[#1c4532] tracking-tight group-hover:scale-110 transition-transform duration-500 hover:text-green-700 drop-shadow-sm">
              {locale === "bn" ? "১৬১২২" : "16122"}
            </div>
            
            <Link href="/login" className="mt-6 flex items-center gap-2 rounded-full bg-[#1c4532] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-green-700 transition-all hover:-translate-y-1 hover:shadow-lg">
              <Bot className="size-4" />
              {locale === "bn" ? "এআই অ্যাসিস্ট্যান্ট ব্যবহার করুন" : "Try the AI assistant"}
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Land Related Services Grid with Bangladesh Watermark & FAQ */}
      <LandServicesSection />

      {/* 4b. Unique Features (Premium Design) */}
      <section className="relative w-full py-24 overflow-hidden bg-white">
        {/* Decorative ambient background blur with continuous drift */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-green-100/40 blur-[120px] mix-blend-multiply animate-[pulse_10s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40rem] h-[40rem] rounded-full bg-[#D4A017]/10 blur-[120px] mix-blend-multiply animate-[pulse_12s_ease-in-out_infinite_2s]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
          <div className="text-center mb-16 md:mb-20">
            <span className="inline-flex items-center rounded-full bg-green-50 px-4 py-1.5 text-sm font-semibold text-green-700 ring-1 ring-inset ring-green-600/20 mb-6 shadow-sm">
              {(landing as any).uniqueFeatures?.badge}
            </span>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl text-balance">
              {(landing as any).uniqueFeatures?.titlePrefix} <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-700 to-emerald-500">{(landing as any).uniqueFeatures?.titleHighlight}</span>
            </h2>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              {(landing as any).uniqueFeatures?.subtitle}
            </p>
          </div>
          
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12 items-stretch">
            {/* Premium Card 1: Community Build */}
            <div className="group relative rounded-[2rem] bg-slate-50 p-1.5 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-green-900/10 duration-500">
              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-green-300 via-emerald-100/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative h-full rounded-[1.75rem] bg-white border border-slate-200/60 p-8 sm:p-12 overflow-hidden shadow-sm">
                
                {/* Background Icon Watermark */}
                <div className="absolute -right-8 -top-8 opacity-[0.02] group-hover:opacity-[0.06] transition-all duration-700 group-hover:rotate-12 group-hover:scale-125">
                  <Users className="w-72 h-72 text-green-900" strokeWidth={1} />
                </div>
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500 shadow-xl shadow-green-600/20 group-hover:-translate-y-1 group-hover:shadow-green-600/40 transition-all duration-500">
                    <Users className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-slate-900 mb-5 tracking-tight">{(landing as any).uniqueFeatures?.communityTitle}</h3>
                  <p className="text-slate-600 text-lg leading-relaxed mb-10 flex-grow">
                    {(landing as any).uniqueFeatures?.communityDesc}
                  </p>
                  
                  <div className="flex items-center text-green-700 font-semibold text-base group-hover:text-green-600 transition-colors w-max cursor-pointer">
                    <span className="relative pb-1">
                      {(landing as any).uniqueFeatures?.communityLink}
                      <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-green-500 group-hover:w-full transition-all duration-300 ease-out"></span>
                    </span>
                    <svg className="ml-2 h-5 w-5 transform group-hover:translate-x-1.5 transition-transform duration-300 ease-out" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Premium Card 2: AI Chatbot */}
            <div className="group relative rounded-[2rem] bg-slate-50 p-1.5 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#D4A017]/15 duration-500">
              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-[#D4A017]/40 via-yellow-100/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative h-full rounded-[1.75rem] bg-white border border-slate-200/60 p-8 sm:p-12 overflow-hidden shadow-sm">
                
                {/* Background Icon Watermark */}
                <div className="absolute -right-8 -top-8 opacity-[0.02] group-hover:opacity-[0.06] transition-all duration-700 group-hover:-rotate-12 group-hover:scale-125">
                  <Bot className="w-72 h-72 text-[#D4A017]" strokeWidth={1} />
                </div>
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#D4A017] to-yellow-500 shadow-xl shadow-[#D4A017]/20 group-hover:-translate-y-1 group-hover:shadow-[#D4A017]/40 transition-all duration-500">
                    <Bot className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-slate-900 mb-5 tracking-tight">{(landing as any).uniqueFeatures?.aiTitle}</h3>
                  <p className="text-slate-600 text-lg leading-relaxed mb-10 flex-grow">
                    {(landing as any).uniqueFeatures?.aiDesc}
                  </p>
                  
                  <Link href="/login" className="flex items-center text-[#D4A017] font-semibold text-base group-hover:text-yellow-600 transition-colors w-max cursor-pointer">
                    <span className="relative pb-1">
                      {(landing as any).uniqueFeatures?.aiLink}
                      <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#D4A017] group-hover:w-full transition-all duration-300 ease-out"></span>
                    </span>
                    <svg className="ml-2 h-5 w-5 transform group-hover:translate-x-1.5 transition-transform duration-300 ease-out" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 5. Trust/Stats Strip */}
      <section className="bg-[#074726] py-10 text-white w-full relative z-10">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-12 gap-y-8 px-4 sm:px-6 lg:px-8 md:justify-between">
          {statKeys.map((key, i) => (
            <div key={key} className="group flex flex-col items-center justify-center text-center p-4 hover:bg-white/5 rounded-xl transition-colors duration-300 cursor-default">
              <div className="font-heading text-3xl font-bold tracking-tight text-[#D4A017] group-hover:scale-110 group-hover:text-yellow-400 transition-all duration-300">
                {statValues[i]}
              </div>
              <div className="mt-1 text-sm font-medium opacity-90 max-w-[200px] text-balance">
                {landing?.trustStats[key as keyof typeof landing.trustStats]}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5b. Nature Gallery */}
      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { src: "/landing/nature-paddy.png", alt: landing?.natureAltPaddy },
            { src: "/landing/nature-river.png", alt: landing?.natureAltRiver },
            { src: "/landing/nature-path.png", alt: landing?.natureAltPath },
          ].map((img, i) => (
            <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-2xl shadow-md border border-slate-200 cursor-pointer">
              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500 z-10 pointer-events-none" />
              <Image src={img.src} alt={String(img.alt || "")} fill className="object-cover transition-transform duration-700 group-hover:scale-110" />
            </div>
          ))}
        </div>
      </section>

      {/* 7. Farmer Landscape Illustration Band with Animations */}
      <div className="w-full relative mt-auto overflow-hidden" style={{ height: "clamp(200px, 30vw, 420px)" }}>
        <svg viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" className="w-full h-full" aria-hidden="true">
          <style>{`
            @keyframes floatClouds {
              0% { transform: translateX(1500px); }
              100% { transform: translateX(-300px); }
            }
            @keyframes riverFlow {
              0% { transform: translateX(0) scaleY(1); }
              50% { transform: translateX(-15px) scaleY(1.05); }
              100% { transform: translateX(0) scaleY(1); }
            }
            @keyframes farmerBob {
              0% { transform: translateY(0); }
              50% { transform: translateY(-3px); }
              100% { transform: translateY(0); }
            }
            @keyframes flyBirds {
              0% { transform: translate(-100px, 50px) scale(0.8); }
              50% { transform: translate(700px, -20px) scale(1); }
              100% { transform: translate(1600px, 30px) scale(1.2); }
            }
            .anim-cloud-1 { animation: floatClouds 60s linear infinite; }
            .anim-cloud-2 { animation: floatClouds 80s linear infinite 30s; }
            .anim-cloud-3 { animation: floatClouds 90s linear infinite 10s; }
            .anim-cloud-4 { animation: floatClouds 70s linear infinite 5s; }
            .anim-cloud-5 { animation: floatClouds 100s linear infinite 40s; }
            .anim-cloud-6 { animation: floatClouds 50s linear infinite 15s; }
            .anim-cloud-7 { animation: floatClouds 75s linear infinite 20s; }
            .anim-cloud-8 { animation: floatClouds 85s linear infinite 50s; }
            .anim-cloud-9 { animation: floatClouds 65s linear infinite 35s; }
            .anim-cloud-10 { animation: floatClouds 95s linear infinite 8s; }
            .anim-river { animation: riverFlow 10s ease-in-out infinite; }
            .anim-farmer { animation: farmerBob 4s ease-in-out infinite; }
            .anim-birds { animation: flyBirds 25s linear infinite; }
            .interactive-cloud { cursor: pointer; transition: transform 0.3s; }
            .interactive-cloud:hover { transform: scale(1.1) translateY(-10px); }
          `}</style>
          
          {/* Sky gradient */}
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="40%" stopColor="#d4edda" />
              <stop offset="100%" stopColor="#a8d5ba" />
            </linearGradient>
          </defs>
          <rect width="1440" height="420" fill="url(#sky)" />
          
          {/* Animated Clouds */}
          <g className="anim-cloud-1 interactive-cloud" fill="#ffffff" opacity="0.5">
            <ellipse cx="100" cy="80" rx="40" ry="20" />
            <ellipse cx="130" cy="70" rx="30" ry="25" />
            <ellipse cx="160" cy="80" rx="35" ry="18" />
          </g>
          <g className="anim-cloud-2 interactive-cloud" fill="#ffffff" opacity="0.4">
            <ellipse cx="300" cy="120" rx="50" ry="25" />
            <ellipse cx="340" cy="110" rx="40" ry="30" />
            <ellipse cx="380" cy="120" rx="45" ry="22" />
          </g>
          <g className="anim-cloud-3 interactive-cloud" fill="#ffffff" opacity="0.3">
            <ellipse cx="600" cy="60" rx="60" ry="30" />
            <ellipse cx="650" cy="50" rx="45" ry="35" />
            <ellipse cx="700" cy="60" rx="50" ry="25" />
          </g>
          <g className="anim-cloud-4 interactive-cloud" fill="#ffffff" opacity="0.5">
            <ellipse cx="850" cy="90" rx="45" ry="22" />
            <ellipse cx="890" cy="80" rx="35" ry="28" />
            <ellipse cx="930" cy="90" rx="40" ry="20" />
          </g>
          <g className="anim-cloud-5 interactive-cloud" fill="#ffffff" opacity="0.25">
            <ellipse cx="1100" cy="140" rx="70" ry="30" />
            <ellipse cx="1150" cy="130" rx="50" ry="35" />
            <ellipse cx="1200" cy="140" rx="60" ry="25" />
          </g>
          <g className="anim-cloud-6 interactive-cloud" fill="#ffffff" opacity="0.6">
            <ellipse cx="1350" cy="50" rx="30" ry="15" />
            <ellipse cx="1375" cy="45" rx="20" ry="20" />
            <ellipse cx="1400" cy="50" rx="25" ry="12" />
          </g>

          {/* Additional Animated Clouds */}
          <g className="anim-cloud-7 interactive-cloud" fill="#ffffff" opacity="0.45">
            <ellipse cx="250" cy="40" rx="50" ry="22" />
            <ellipse cx="280" cy="30" rx="35" ry="25" />
            <ellipse cx="320" cy="40" rx="40" ry="18" />
          </g>
          <g className="anim-cloud-8 interactive-cloud" fill="#ffffff" opacity="0.35">
            <ellipse cx="780" cy="110" rx="40" ry="20" />
            <ellipse cx="810" cy="100" rx="30" ry="25" />
            <ellipse cx="840" cy="110" rx="35" ry="15" />
          </g>
          <g className="anim-cloud-9 interactive-cloud" fill="#ffffff" opacity="0.55">
            <ellipse cx="1020" cy="65" rx="55" ry="25" />
            <ellipse cx="1060" cy="55" rx="45" ry="30" />
            <ellipse cx="1100" cy="65" rx="40" ry="22" />
          </g>
          <g className="anim-cloud-10 interactive-cloud" fill="#ffffff" opacity="0.25">
            <ellipse cx="50" cy="100" rx="60" ry="25" />
            <ellipse cx="90" cy="90" rx="40" ry="30" />
            <ellipse cx="120" cy="100" rx="45" ry="20" />
          </g>

          {/* Animated Birds */}
          <g className="anim-birds" stroke="#2c3e50" strokeWidth="2" fill="none">
            <path d="M0,10 Q5,0 10,10 Q15,0 20,10" />
            <path d="M30,5 Q35,-5 40,5 Q45,-5 50,5" />
            <path d="M15,25 Q20,15 25,25 Q30,15 35,25" />
          </g>

          {/* Distant tree line */}
          <ellipse cx="200" cy="260" rx="120" ry="40" fill="#3a7d44" opacity="0.5" />
          <ellipse cx="500" cy="255" rx="150" ry="45" fill="#3a7d44" opacity="0.4" />
          <ellipse cx="900" cy="258" rx="180" ry="42" fill="#3a7d44" opacity="0.45" />
          <ellipse cx="1300" cy="262" rx="130" ry="38" fill="#3a7d44" opacity="0.5" />
          {/* Paddy fields */}
          <rect x="0" y="280" width="1440" height="140" fill="#4a9e5c" />
          <rect x="0" y="320" width="1440" height="100" fill="#3d8a4f" />
          {/* River */}
          <path d="M0 340 Q200 310 400 340 Q600 370 800 335 Q1000 300 1200 340 Q1350 360 1440 345 L1440 380 Q1350 395 1200 375 Q1000 340 800 370 Q600 400 400 375 Q200 350 0 375 Z" fill="#5ba8c8" opacity="0.6" className="anim-river" />
          {/* Palm trees left */}
          <rect x="80" y="200" width="6" height="120" fill="#5d4037" rx="3" />
          <ellipse cx="83" cy="195" rx="35" ry="20" fill="#2e7d32" />
          <ellipse cx="65" cy="205" rx="25" ry="12" fill="#388e3c" />
          <ellipse cx="100" cy="208" rx="28" ry="14" fill="#388e3c" />
          <rect x="150" y="220" width="5" height="100" fill="#5d4037" rx="2" />
          <ellipse cx="152" cy="215" rx="30" ry="18" fill="#2e7d32" />
          {/* Palm trees right */}
          <rect x="1300" y="210" width="6" height="110" fill="#5d4037" rx="3" />
          <ellipse cx="1303" cy="205" rx="35" ry="20" fill="#2e7d32" />
          <ellipse cx="1285" cy="215" rx="25" ry="12" fill="#388e3c" />
          <rect x="1370" y="225" width="5" height="95" fill="#5d4037" rx="2" />
          <ellipse cx="1372" cy="220" rx="28" ry="16" fill="#2e7d32" />
          {/* Farmer with oxen - Group wrapped with bobbing animation */}
          <g className="anim-farmer">
            {/* Ox 1 */}
            <ellipse cx="380" cy="310" rx="28" ry="16" fill="#6d4c41" />
          <rect x="360" y="310" width="5" height="18" fill="#5d4037" rx="2" />
          <rect x="390" y="310" width="5" height="18" fill="#5d4037" rx="2" />
          <circle cx="370" cy="300" r="8" fill="#795548" />
          <line x1="368" y1="295" x2="365" y2="288" stroke="#5d4037" strokeWidth="2" />
          <line x1="372" y1="295" x2="375" y2="288" stroke="#5d4037" strokeWidth="2" />
          {/* Ox 2 */}
          <ellipse cx="430" cy="310" rx="28" ry="16" fill="#795548" />
          <rect x="410" y="310" width="5" height="18" fill="#5d4037" rx="2" />
          <rect x="440" y="310" width="5" height="18" fill="#5d4037" rx="2" />
          <circle cx="420" cy="300" r="8" fill="#8d6e63" />
          <line x1="418" y1="295" x2="415" y2="288" stroke="#5d4037" strokeWidth="2" />
          <line x1="422" y1="295" x2="425" y2="288" stroke="#5d4037" strokeWidth="2" />
          {/* Yoke */}
          <line x1="370" y1="298" x2="420" y2="298" stroke="#4e342e" strokeWidth="3" />
          {/* Plow */}
          <line x1="405" y1="310" x2="460" y2="295" stroke="#4e342e" strokeWidth="2.5" />
          <line x1="460" y1="295" x2="465" y2="330" stroke="#4e342e" strokeWidth="2" />
          {/* Farmer */}
          <circle cx="465" cy="280" r="7" fill="#d4a373" />
          <rect x="462" y="287" width="6" height="18" fill="#1b5e20" rx="2" />
          <rect x="460" y="305" width="4" height="14" fill="#4e342e" rx="1" />
          <rect x="466" y="305" width="4" height="14" fill="#4e342e" rx="1" />
            <line x1="462" y1="292" x2="455" y2="300" stroke="#1b5e20" strokeWidth="2" />
            <line x1="468" y1="292" x2="460" y2="298" stroke="#1b5e20" strokeWidth="2" />
          </g>
          {/* Ground line */}
          <rect x="0" y="360" width="1440" height="60" fill="#2e7d32" />
          {/* Small bushes */}
          <ellipse cx="600" cy="340" rx="20" ry="10" fill="#388e3c" />
          <ellipse cx="750" cy="345" rx="15" ry="8" fill="#43a047" />
          <ellipse cx="1050" cy="338" rx="22" ry="11" fill="#388e3c" />
        </svg>
      </div>

      {/* 8. Footer */}
      <footer className="bg-[#074726] text-white/80 py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 mb-10">
          {/* Col 1 — Important Links */}
          <div className="space-y-4">
            <h4 className="text-white font-heading font-semibold text-base">{landing?.footer.linksHeading}</h4>
            <ul className="space-y-2.5 text-sm">
              {(["linkNationalPortal","linkLandMinistry","linkInfoDirectorate","linkGrievance","linkPrivacy","linkFaq","linkContact"] as const).map(k => (
                <li key={k} className="flex items-center gap-2">
                  <span className="text-[#D4A017] text-[10px]">▶</span>
                  <Link href="#" className="hover:text-white transition-colors">{(landing?.footer as Record<string, any>)?.[k]}</Link>
                </li>
              ))}
            </ul>
          </div>
          {/* Col 2 — Planning & Implementation */}
          <div className="space-y-4">
            <h4 className="text-[#ffffff] font-heading font-semibold text-base">{landing?.footer.planHeading}</h4>
            <div className="flex flex-col items-start gap-3 pt-2">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white/70"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                </div>
                <span className="text-white font-medium text-sm">{landing?.footer.planProjectName}</span>
              </div>
              <div className="w-full rounded-lg bg-black/30 border border-white/10 px-4 py-2.5 text-xs text-white/80 text-center">
                {landing?.footer.planDeptName}
              </div>
            </div>
          </div>
          {/* Col 3 — Download */}
          <div className="space-y-4">
            <h4 className="text-white font-heading font-semibold text-base">{landing?.footer.downloadHeading}</h4>
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex h-11 w-40 items-center gap-2.5 rounded-lg bg-black/50 border border-white/15 px-3 cursor-pointer hover:bg-black/60 transition-colors">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white"><path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12L3.84 21.85C3.34 21.61 3 21.09 3 20.5ZM16.81 15.12L6.05 21.34L14.54 12.85L16.81 15.12ZM20.16 10.81C20.5 11.08 20.75 11.5 20.75 12C20.75 12.5 20.5 12.92 20.16 13.19L17.89 14.5L15.39 12L17.89 9.5L20.16 10.81ZM6.05 2.66L16.81 8.88L14.54 11.15L6.05 2.66Z"/></svg>
                <div className="flex flex-col"><span className="text-[9px] text-white/60 leading-none">GET IT ON</span><span className="text-xs font-medium text-white leading-tight">Google Play</span></div>
              </div>
              <div className="flex h-11 w-40 items-center gap-2.5 rounded-lg bg-black/50 border border-white/15 px-3 cursor-pointer hover:bg-black/60 transition-colors">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white"><path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 16.56 2.93 11.3 4.7 7.72C5.57 5.94 7.36 4.86 9.28 4.84C10.56 4.81 11.78 5.72 12.57 5.72C13.36 5.72 14.85 4.62 16.4 4.8C17.07 4.83 18.86 5.08 19.99 6.75C19.88 6.82 17.64 8.11 17.67 10.82C17.7 14.1 20.53 15.19 20.56 15.21C20.53 15.27 20.09 16.89 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/></svg>
                <div className="flex flex-col"><span className="text-[9px] text-white/60 leading-none">Download on the</span><span className="text-xs font-medium text-white leading-tight">App Store</span></div>
              </div>
            </div>
          </div>
          {/* Col 4 — Social */}
          <div className="space-y-4">
            <h4 className="text-white font-heading font-semibold text-base">{landing?.footer.socialHeading}</h4>
            <div className="flex gap-3 pt-2">
              {[
                { label: "FB", bg: "bg-[#1877F2]" },
                { label: "X", bg: "bg-black" },
                { label: "IG", bg: "bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888]" },
                { label: "YT", bg: "bg-[#FF0000]" },
              ].map((s) => (
                <div key={s.label} className={`h-10 w-10 rounded-full ${s.bg} flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity shadow-md`}>
                  <span className="text-xs font-bold text-white">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Technical Support By */}
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-end gap-3 pb-6 text-xs text-white/50">
          <span>{landing?.footer.techSupportLabel}</span>
          <div className="flex gap-3">
            {(["techPartner1","techPartner2","techPartner3"] as const).map(k => (
              <div key={k} className="rounded bg-white/10 border border-white/10 px-3 py-1 text-white/60 text-[10px] font-medium">
                {(landing?.footer as Record<string, any>)?.[k]}
              </div>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div className="max-w-7xl mx-auto pt-6 border-t border-white/10 text-center text-xs text-white/50">
          {landing?.footer.copyright}
        </div>
      </footer>
    </div>
  );
}
