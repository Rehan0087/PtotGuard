import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  Noto_Sans_Bengali,
  Public_Sans,
  Space_Grotesk,
  Space_Mono,
} from "next/font/google";
import { Providers } from "@/components/providers";
import { THEME_INIT_SCRIPT } from "@/hooks/use-theme";
import { LOCALE_COOKIE, LOCALE_TAGS, getDictionary, resolveLocale } from "@/lib/i18n";
import "./globals.css";

// UI / body — Public Sans is the USWDS civic typeface: institutional, highly legible.
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

// Display / headings — technical, drafting-instrument character.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

// Data — parcel IDs, coordinates, case numbers rendered as survey labels.
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

// Bengali script. Records in Cumilla are kept in Bangla, so mouza names, owner
// names, and namjari text all need it. It is appended to every stack in
// globals.css rather than swapped in: the browser resolves per glyph, so Latin
// stays in Public Sans and Bengali codepoints fall through to this — no
// language detection and no wrapper class at the call site.
const notoSansBengali = Noto_Sans_Bengali({
  variable: "--font-noto-bengali",
  subsets: ["bengali"],
  display: "swap",
});

/** The active language, from the cookie the language toggle writes. */
async function activeLocale() {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await activeLocale());
  return {
    title: { default: t.meta.title, template: t.meta.titleTemplate },
    description: t.meta.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read on the server so the first paint is already in the right language.
  // Text can't be patched in before hydration the way the theme class can.
  const locale = await activeLocale();

  return (
    <html
      lang={LOCALE_TAGS[locale]}
      suppressHydrationWarning
      className={`${publicSans.variable} ${spaceGrotesk.variable} ${spaceMono.variable} ${notoSansBengali.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Anti-flash theme init. Runs once during SSR/first paint; React 19 logs a
            benign dev-only advisory about inline scripts that is stripped in prod. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
