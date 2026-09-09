"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X, Globe, User, Shield, BookOpen, HelpCircle } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionStore } from "@/store/session";
import { roleHome } from "@/lib/nav";

/**
 * Bangladesh Government Seal / Emblem SVG
 */
export function BangladeshGovSeal({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#0b6b3a" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="44" stroke="#0b6b3a" strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="50" cy="50" r="33" fill="#e53935" />
      {/* Map silhouette */}
      <path
        d="M48 24c-2 3-5 7-8 10-3 3-7 5-10 8-2 3-3 7-3 12 0 6 2 11 4 16 2 3 5 6 7 8 2 2 5 3 7 5 3 3 5 7 6 11 1 3 1 7 0 10-2 4-4 7-7 10-3 3-7 6-10 9-3 3-5 6-6 10 0 3 0 7 1 10 2 4 4 7 7 9 3 2 5 3 7 2 3-2 4-4 5-7 2-4 2-8 1-12-1-3-3-6-5-8-2-2-4-3-6-3-3-1-6-1-8 0-3 1-6 3-8 5-2 2-3 4-3 6 0 3 1 6 3 9 2 4 4 6 7 8 2 1 3 1 5 0 3-2 4-4 5-7 1-3 1-7 0-10-1-3-3-5-5-6-3-2-6-3-9-3-3 0-6 1-8 3-2 2-3 4-4 6 0 4 2 8 5 10 3 2 5 2 7 1 3-2 5-4 6-7 2-4 2-8 1-12-1-3-3-6-5-8-3-3-6-4-9-5-3-1-6-1-8 1-3 2-6 4-7 7-2 3-2 6-1 9 1 4 2 7 4 10 2 2 4 3 6 3 3 0 5-1 7-3 3-3 4-6 4-10 0-3-2-6-4-8-3-3-6-4-9-5-3-1-5 0-7 2-3 2-4 5-5 8-1 4 0 8 1 11 2 4 4 6 6 8 2 1 3 1 4 0 2-2 3-4 3-6 0-3-1-6-3-9-2-3-4-5-7-6-3-1-6-1-8 1-3 2-5 4-7 7-1 3-2 6-1 9 1 3 2 5 3 7 3 3 6 4 9 4 3 0 5-1 7-3 2-3 3-6 3-9 0-5-2-9-4-12-2-3-4-4-7-5-3-1-6-1-9 1-3 1-5 3-7 6z"
        fill="#ffeb3b"
      />
      <circle cx="50" cy="11" r="2" fill="#0b6b3a" />
      <circle cx="89" cy="50" r="2" fill="#0b6b3a" />
      <circle cx="11" cy="50" r="2" fill="#0b6b3a" />
      <circle cx="50" cy="89" r="2" fill="#0b6b3a" />
    </svg>
  );
}

/**
 * 4-Grid Colorful Logo Icon
 */
export function LandServiceGridLogo({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-0.5 w-10 h-10 p-0.5 bg-white rounded-md shadow-sm border border-slate-200 shrink-0", className)}>
      {/* Top-Left: Lime Green Box */}
      <div className="bg-[#8bc34a] rounded-[2px] flex items-center justify-center p-0.5">
        <svg viewBox="0 0 24 24" className="w-full h-full fill-none stroke-white stroke-[2.5] stroke-linecap-round stroke-linejoin-round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
      </div>
      {/* Top-Right: Sky Blue Box */}
      <div className="bg-[#29b6f6] rounded-[2px] flex items-center justify-center p-0.5">
        <svg viewBox="0 0 24 24" className="w-full h-full fill-none stroke-white stroke-[2.5] stroke-linecap-round stroke-linejoin-round">
          <path d="M5 12.55a11 11 0 0114.08 0" />
          <path d="M1.42 9a16 16 0 0121.16 0" />
          <circle cx="12" cy="18" r="1.5" fill="white" />
        </svg>
      </div>
      {/* Bottom-Left: Orange Box */}
      <div className="bg-[#ffa726] rounded-[2px] flex items-center justify-center p-0.5">
        <span className="text-[10px] font-bold text-white leading-none">৳</span>
      </div>
      {/* Bottom-Right: Blue Box */}
      <div className="bg-[#42a5f5] rounded-[2px] flex items-center justify-center p-0.5">
        <svg viewBox="0 0 24 24" className="w-full h-full fill-none stroke-white stroke-[2.5] stroke-linecap-round stroke-linejoin-round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 12h10M12 7v10" />
        </svg>
      </div>
    </div>
  );
}

export function GovNavbar() {
  const t = useT();
  const landing = t.pages.landing;
  const { locale, setLocale } = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [formattedDate, setFormattedDate] = useState("");

  const role = useSessionStore((s) => s.role);
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const hasHydrated = useSessionStore((s) => s.hasHydrated);

  useEffect(() => {
    const updateDate = () => {
      const now = new Date();
      if (locale === "bn") {
        const daysBn = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
        const monthsBn = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
        const toBnDigits = (str: string | number) => 
          String(str).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[parseInt(d)]);

        const dayName = daysBn[now.getDay()];
        const dateNum = toBnDigits(now.getDate());
        const monthName = monthsBn[now.getMonth()];
        const yearNum = toBnDigits(now.getFullYear());

        setFormattedDate(`${dayName}, ৩ ভাদ্র ১৪৩৩ | ${dateNum} ${monthName} ${yearNum}`);
      } else {
        const options: Intl.DateTimeFormatOptions = { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        };
        setFormattedDate(now.toLocaleDateString('en-US', options));
      }
    };
    updateDate();
  }, [locale]);

  return (
    <header className="w-full font-sans sticky top-0 z-50 shadow-sm">
      {/* Top Banner (Green Gradient) */}
      <div className="w-full bg-[linear-gradient(to_right,#f2f8f4_0%,#a5d6b4_15%,#489762_40%,#186938_70%,#094825_100%)] text-white px-4 sm:px-6 lg:px-8 py-2 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Left Brand Lockup */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Government Seal */}
            <BangladeshGovSeal className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 drop-shadow-sm" />
            
            {/* Divider */}
            <div className="h-8 w-[1px] bg-slate-400/40 shrink-0" />
            
            {/* 4-Grid Icon */}
            <LandServiceGridLogo className="h-9 w-9 sm:h-10 sm:w-10" />

            {/* Title & Tagline */}
            <div className="flex flex-col justify-center leading-none text-slate-800 dark:text-slate-100">
              <div className="flex items-center gap-1 font-bold text-xs sm:text-sm tracking-tight text-[#064222] dark:text-white">
                <span>{locale === "bn" ? "জনবান্ধব" : "Citizen-Friendly"}</span>
                <span>{locale === "bn" ? "ভূমিসেবা" : "Land Service"}</span>
                <span>{locale === "bn" ? "অটোমেশন" : "Automation"}</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-medium text-[#0b6b3a]/90 dark:text-emerald-200 mt-0.5">
                {locale === "bn" ? "স্মার্ট ভূমিসেবায় বাংলাদেশ" : "Smart Land Services Bangladesh"}
              </span>
            </div>
          </div>

          {/* Right Controls: Date & Language Pill */}
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Date Display */}
            <div className="hidden md:block text-xs sm:text-sm font-medium text-white/95 text-right tracking-wide">
              {formattedDate}
            </div>

            {/* Language Toggle Pill */}
            <div className="flex items-center rounded bg-[#074726] p-0.5 border border-white/20 shadow-inner">
              <button
                onClick={() => setLocale("bn")}
                className={cn(
                  "px-2.5 py-0.5 text-xs font-bold transition-all rounded-[3px]",
                  locale === "bn"
                    ? "bg-[#0b6b3a] text-white shadow-sm"
                    : "bg-transparent text-white/80 hover:text-white"
                )}
              >
                বাং
              </button>
              <button
                onClick={() => setLocale("en")}
                className={cn(
                  "px-2.5 py-0.5 text-xs font-bold transition-all rounded-[3px]",
                  locale === "en"
                    ? "bg-white text-[#0b6b3a] shadow-sm"
                    : "bg-transparent text-white/80 hover:text-white"
                )}
              >
                EN
              </button>
            </div>

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-white hover:bg-white/10 rounded-md"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar (White Background) */}
      <nav className="w-full bg-white border-b border-slate-200 shadow-sm px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-end">
          
          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-800">
            {/* Home */}
            <Link 
              href="/" 
              className="hover:text-[#0b6b3a] transition-colors py-1 font-semibold text-slate-800"
            >
              {locale === "bn" ? "হোম" : "Home"}
            </Link>

            {/* About Us Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 hover:text-[#0b6b3a] transition-colors py-1 outline-none font-semibold text-slate-800">
                {locale === "bn" ? "আমাদের সম্পর্কে" : "About Us"}
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <Link href="/about">{locale === "bn" ? "আমাদের লক্ষ্য ও উদ্দেশ্য" : "Our Mission & Vision"}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/about#structure">{locale === "bn" ? "সাংগঠনিক কাঠামো" : "Organizational Structure"}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/about#officers">{locale === "bn" ? "কর্মকর্তা তালিকা" : "Officer Directory"}</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Notice / Learn Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 hover:text-[#0b6b3a] transition-colors py-1 outline-none font-semibold text-slate-800">
                {locale === "bn" ? "জ্ঞাতব্য" : "Notice & Info"}
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/support#bhumi-id">{landing?.navLearnBhumiId || "BhumiID Guide"}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/support#namjari">{landing?.navLearnNamjari || "Namjari Process"}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/support#faraiz">{landing?.navLearnFaraiz || "Faraiz Guide"}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/support#survey">{landing?.navLearnSurvey || "Survey Cycle"}</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Manual */}
            <Link 
              href="/support" 
              className="hover:text-[#0b6b3a] transition-colors py-1 font-semibold text-slate-800"
            >
              {locale === "bn" ? "ম্যানুয়াল" : "Manual"}
            </Link>

            {/* Login / Dashboard Button */}
            {hasHydrated && isAuthenticated ? (
              <Link 
                href={roleHome(role)} 
                className="flex items-center gap-1.5 bg-[#074726] hover:bg-[#05351c] text-white text-xs sm:text-sm font-semibold rounded-full px-6 py-2 shadow-sm transition-all duration-200"
              >
                <span>{locale === "bn" ? "ড্যাশবোর্ড" : "Dashboard"}</span>
                <User className="h-4 w-4 text-white/90" />
              </Link>
            ) : (
              <Link 
                href="/login" 
                className="flex items-center gap-1.5 bg-[#074726] hover:bg-[#05351c] text-white text-xs sm:text-sm font-semibold rounded-full px-6 py-2 shadow-sm transition-all duration-200"
              >
                <span>{locale === "bn" ? "লগইন" : "Login"}</span>
                <User className="h-4 w-4 text-white/90" />
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 pt-3 border-t border-slate-200 space-y-3 px-2 pb-3 bg-white">
            <Link 
              href="/" 
              onClick={() => setMobileMenuOpen(false)}
              className="block font-semibold text-slate-800 hover:text-[#0b6b3a]"
            >
              {locale === "bn" ? "হোম" : "Home"}
            </Link>
            <Link 
              href="/about" 
              onClick={() => setMobileMenuOpen(false)}
              className="block font-semibold text-slate-800 hover:text-[#0b6b3a]"
            >
              {locale === "bn" ? "আমাদের সম্পর্কে" : "About Us"}
            </Link>
            <Link 
              href="/support" 
              onClick={() => setMobileMenuOpen(false)}
              className="block font-semibold text-slate-800 hover:text-[#0b6b3a]"
            >
              {locale === "bn" ? "জ্ঞাতব্য" : "Notice & Info"}
            </Link>
            <Link 
              href="/support" 
              onClick={() => setMobileMenuOpen(false)}
              className="block font-semibold text-slate-800 hover:text-[#0b6b3a]"
            >
              {locale === "bn" ? "ম্যানুয়াল" : "Manual"}
            </Link>
            <Link 
              href="/login" 
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center justify-between w-full bg-[#074726] text-white font-semibold rounded-full px-5 py-2 text-sm shadow-sm"
            >
              <span>{locale === "bn" ? "লগইন" : "Login"}</span>
              <User className="h-4 w-4 text-white/90" />
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
