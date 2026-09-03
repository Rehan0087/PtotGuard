"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { 
  Fingerprint, 
  FileText, 
  Map, 
  MapPin, 
  Award, 
  ShieldCheck, 
  Scale, 
  Landmark, 
  Headphones,
  Plus,
  Minus,
  HelpCircle
} from "lucide-react";

export function LandServicesSection() {
  const t = useT();
  const landing = t.pages.landing;
  const { locale } = useLocale();

  const [openFaq, setOpenFaq] = useState<string | null>("1");

  const toggleFaq = (key: string) => {
    setOpenFaq(openFaq === key ? null : key);
  };

  const servicesList = [
    {
      id: "mutation",
      titleBn: "মিউটেশন",
      titleEn: "Mutation (e-Namjari)",
      barColor: "bg-[#0083B0]",
      iconBg: "bg-[#e0f7fa]",
      iconColor: "text-[#0083B0]",
      icon: Fingerprint,
      href: "/portal?service=mutation"
    },
    {
      id: "landTax",
      titleBn: "ভূমি উন্নয়ন কর",
      titleEn: "Land Development Tax",
      barColor: "bg-[#002699]",
      iconBg: "bg-[#fff3e0]",
      iconColor: "text-[#ff9800]",
      isTakaIcon: true,
      href: "/portal?service=land-tax"
    },
    {
      id: "recordsMap",
      titleBn: "ভূমি রেকর্ড ও ম্যাপ",
      titleEn: "Land Records & Map",
      barColor: "bg-[#00d2d3]",
      iconBg: "bg-[#e8f5e9]",
      iconColor: "text-[#4caf50]",
      icon: Map,
      href: "/portal?service=records-maps"
    },
    {
      id: "acquisition",
      titleBn: "ভূমি অধিগ্রহণ ও হুকুমদখল",
      titleEn: "Land Acquisition",
      barColor: "bg-[#e84393]",
      iconBg: "bg-[#fce4ec]",
      iconColor: "text-[#e84393]",
      icon: MapPin,
      href: "/portal?service=acquisition"
    },
    {
      id: "leasing",
      titleBn: "ইজারা ও বন্দোবস্ত",
      titleEn: "Leasing & Settlement",
      barColor: "bg-[#ff4757]",
      iconBg: "bg-[#ffebee]",
      iconColor: "text-[#ff4757]",
      icon: Award,
      href: "/portal?service=leasing"
    },
    {
      id: "adminMgmt",
      titleBn: "ভূমি প্রশাসন ব্যবস্থাপনা",
      titleEn: "Land Admin Management",
      barColor: "bg-[#8e44ad]",
      iconBg: "bg-[#f3e5f5]",
      iconColor: "text-[#8e44ad]",
      icon: ShieldCheck,
      href: "/portal?service=admin"
    },
    {
      id: "revenueCases",
      titleBn: "ভূমি রাজস্ব মামলা",
      titleEn: "Land Revenue Cases",
      barColor: "bg-[#0984e3]",
      iconBg: "bg-[#e3f2fd]",
      iconColor: "text-[#0984e3]",
      icon: Scale,
      href: "/portal?service=revenue-cases"
    },
    {
      id: "infoBank",
      titleBn: "ভূমি তথ্য ব্যাংক",
      titleEn: "Land Information Bank",
      barColor: "bg-[#00cec9]",
      iconBg: "bg-[#e0f7fa]",
      iconColor: "text-[#00cec9]",
      icon: Landmark,
      href: "/portal?service=info-bank"
    },
    {
      id: "techGrievance",
      titleBn: "কারিগরি ও অভিযোগ প্রতিকার ব্যবস্থাপনা",
      titleEn: "Tech & Grievance Redressal",
      barColor: "bg-[#074726]",
      iconBg: "bg-[#e8f5e9]",
      iconColor: "text-[#074726]",
      icon: Headphones,
      href: "/portal?service=grievance"
    }
  ];

  const faqs = [
    {
      id: "1",
      qBn: "পাসওয়ার্ড ভুলে গেলে কি নতুন করে রেজিস্ট্রেশন করতে হবে?",
      qEn: "Do I need to register again if I forget my password?",
      aBn: "না, নতুন করে রেজিস্ট্রেশনের প্রয়োজন নেই। লগইন পৃষ্ঠায় 'পাসওয়ার্ড ভুলে গেছেন' লিংকে ক্লিক করে আপনার নিবন্ধিত মোবাইল নম্বরে ওটিপি (OTP) গ্রহণ করে সহজেই নতুন পাসওয়ার্ড সেট করতে পারবেন।",
      aEn: "No, you do not need to register again. Click 'Forgot Password' on the login page and enter the OTP sent to your registered mobile number to reset your password."
    },
    {
      id: "2",
      qBn: "ভূমি সেবা হটলাইন নম্বর কোনটি?",
      qEn: "What is the Land Service Hotline number?",
      aBn: "ভূমিসেবা সংক্রান্ত যেকোনো সহযোগিতার জন্য দেশের যেকোনো প্রান্ত থেকে ১৬১২২ (১৬১২২) নম্বরে এবং প্রবাসী নাগরিকগণ +৮৮০৯৬১২৩১৬১২২ নম্বরে কল করতে পারেন।",
      aEn: "For land service support, call 16122 from Bangladesh or +8809612316122 from abroad."
    },
    {
      id: "3",
      qBn: "কখন প্রোফাইলের অগ্রগতি ১০০% হবে?",
      qEn: "When will my profile progress reach 100%?",
      aBn: "আপনার জাতীয় পরিচয়পত্র (NID) যাচাইকরণের সাথে সাথে ই-মেইল, বর্তমান ঠিকানা এবং অন্তত একটি খতিয়ান বা ডেসিমেল ভূমি রেকর্ড সফলভাবে সংযুক্ত করলে প্রোফাইল অগ্রগতি ১০০% হবে।",
      aEn: "Your profile progress reaches 100% once NID verification is complete and you link your email, current address, and at least one land record/khatian."
    }
  ];

  return (
    <div className="w-full bg-[#f8faf9] relative py-16 px-4 sm:px-6 lg:px-8 overflow-hidden font-sans">
      
      {/* Watermark Background Map of Bangladesh */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 py-10 opacity-15 mix-blend-multiply drop-shadow-sm">
        <div className="relative w-[120%] max-w-6xl h-full min-h-[900px] scale-125 md:scale-150">
          <Image 
            src="/landing/bd-map-shadow.png" 
            alt="Bangladesh Map Watermark" 
            fill 
            className="object-contain grayscale contrast-125 saturate-50"
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Section Heading */}
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#074726] tracking-tight">
            {locale === "bn" ? "ভূমি সংক্রান্ত সেবা" : "Land Related Services"}
          </h2>
        </div>

        {/* 9 Service Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {servicesList.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.id}
                href={card.href}
                className={cn(
                  "relative overflow-hidden bg-white rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.05)] border border-slate-200/80 p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 min-h-[170px] group",
                  card.id === "techGrievance" && "sm:col-span-2 lg:col-span-1"
                )}
              >
                {/* Top Accent Bar */}
                <div className={cn("absolute top-0 left-0 right-0 h-2 w-full", card.barColor)} />

                {/* Card Icon */}
                <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-105 shadow-sm", card.iconBg)}>
                  {card.isTakaIcon ? (
                    <span className="text-2xl font-black text-[#ff9800] leading-none">৳</span>
                  ) : (
                    <Icon className={cn("w-7 h-7", card.iconColor)} />
                  )}
                </div>

                {/* Card Title */}
                <h3 className="font-bold text-base sm:text-lg text-slate-800 group-hover:text-[#074726] transition-colors leading-snug">
                  {locale === "bn" ? card.titleBn : card.titleEn}
                </h3>
              </Link>
            );
          })}
        </div>

        {/* Integrated Mouza Pill Announcement Banner */}
        <div className="flex justify-center my-12">
          <Link
            href="/portal?tab=purbachal"
            className="bg-[#074726] hover:bg-[#05351c] text-white font-semibold text-xs sm:text-sm md:text-base px-6 sm:px-8 py-3 rounded-lg shadow-md border border-[#074726] text-center transition-all duration-200 hover:scale-[1.01]"
          >
            {locale === "bn"
              ? "রাজউক পূর্বাচল নতুন শহর প্রকল্পের সকল মৌজার সমন্বিত তথ্য"
              : "Integrated Mouza Information of RAJUK Purbachal New Town Project"}
          </Link>
        </div>

        {/* FAQ Accordion Section */}
        <div className="mt-16 pt-8 border-t border-slate-200/80">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left FAQ Column */}
            <div className="lg:col-span-8 space-y-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#074726] mb-6">
                {locale === "bn" ? "সচরাচর জিজ্ঞাসা" : "Frequently Asked Questions"}
              </h2>

              <div className="space-y-3">
                {faqs.map((faq) => {
                  const isOpen = openFaq === faq.id;
                  return (
                    <div key={faq.id} className="w-full">
                      <button
                        onClick={() => toggleFaq(faq.id)}
                        className="w-full bg-[#074726] hover:bg-[#05351c] text-white font-semibold px-5 py-3.5 rounded-lg flex items-center justify-between text-left text-sm sm:text-base shadow-sm transition-all duration-200"
                      >
                        <span className="pr-4">{locale === "bn" ? faq.qBn : faq.qEn}</span>
                        {isOpen ? <Minus className="h-5 w-5 shrink-0" /> : <Plus className="h-5 w-5 shrink-0" />}
                      </button>
                      
                      {isOpen && (
                        <div className="bg-white text-slate-700 p-5 rounded-b-lg border-x border-b border-slate-200 text-sm sm:text-base leading-relaxed shadow-sm transition-all duration-200">
                          {locale === "bn" ? faq.aBn : faq.aEn}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Question Mark Graphics */}
            <div className="lg:col-span-4 hidden lg:flex items-center justify-center relative min-h-[280px]">
              <div className="relative flex items-center justify-center">
                <div className="w-48 h-48 rounded-full bg-emerald-100/60 border border-emerald-200 flex items-center justify-center">
                  <span className="text-9xl font-black text-[#074726]/80 select-none">?</span>
                </div>
                <div className="absolute -top-4 -right-2 w-14 h-14 rounded-full bg-[#074726] text-white flex items-center justify-center font-bold text-2xl shadow-lg rotate-12">
                  ?
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
