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
  Shield
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
                className="object-cover"
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
                  className="flex flex-1 items-center justify-center gap-2 px-2 py-3 text-xs font-medium text-white hover:bg-white/10 transition-colors sm:text-sm whitespace-nowrap min-w-[150px]"
                >
                  <Icon className="h-4 w-4 opacity-70" />
                  {(landing as Record<string, any>)?.[link.key]}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: Support Callout */}
        <div className="flex w-full flex-col justify-center bg-muted px-8 py-12 md:w-80 lg:w-96 lg:px-12 border-l border-border shrink-0">
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {landing?.supportCall}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B6B3A]/10 text-[#0B6B3A]">
                  <HelpCircle className="h-6 w-6" />
                </div>
                <div className="font-heading text-3xl font-bold tracking-tight text-[#0B6B3A]">
                  {landing?.helpline}
                </div>
              </div>
            </div>
            
            <div className="space-y-4 pt-4 border-t border-border">
              <Button className="w-full landing-accent-bg hover:bg-[#B58813] text-white font-medium" size="lg">
                {landing?.liveChat}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Land Related Services Grid with Bangladesh Watermark & FAQ */}
      <LandServicesSection />

      {/* 5. Trust/Stats Strip */}
      <section className="bg-[#074726] py-10 text-white w-full relative z-10">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-12 gap-y-8 px-4 sm:px-6 lg:px-8 md:justify-between">
          {statKeys.map((key, i) => (
            <div key={key} className="flex flex-col items-center justify-center text-center">
              <div className="font-heading text-3xl font-bold tracking-tight text-[#D4A017]">
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
            <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-md border border-slate-200">
              <Image src={img.src} alt={String(img.alt || "")} fill className="object-cover hover:scale-105 transition-transform duration-300" />
            </div>
          ))}
        </div>
      </section>

      {/* 7. Farmer Landscape Illustration Band */}
      <div className="w-full relative mt-auto overflow-hidden" style={{ height: "clamp(200px, 30vw, 420px)" }}>
        <svg viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" className="w-full h-full" aria-hidden="true">
          {/* Sky gradient */}
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="40%" stopColor="#d4edda" />
              <stop offset="100%" stopColor="#a8d5ba" />
            </linearGradient>
          </defs>
          <rect width="1440" height="420" fill="url(#sky)" />
          {/* Distant tree line */}
          <ellipse cx="200" cy="260" rx="120" ry="40" fill="#3a7d44" opacity="0.5" />
          <ellipse cx="500" cy="255" rx="150" ry="45" fill="#3a7d44" opacity="0.4" />
          <ellipse cx="900" cy="258" rx="180" ry="42" fill="#3a7d44" opacity="0.45" />
          <ellipse cx="1300" cy="262" rx="130" ry="38" fill="#3a7d44" opacity="0.5" />
          {/* Paddy fields */}
          <rect x="0" y="280" width="1440" height="140" fill="#4a9e5c" />
          <rect x="0" y="320" width="1440" height="100" fill="#3d8a4f" />
          {/* River */}
          <path d="M0 340 Q200 310 400 340 Q600 370 800 335 Q1000 300 1200 340 Q1350 360 1440 345 L1440 380 Q1350 395 1200 375 Q1000 340 800 370 Q600 400 400 375 Q200 350 0 375 Z" fill="#5ba8c8" opacity="0.6" />
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
          {/* Farmer with oxen */}
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
