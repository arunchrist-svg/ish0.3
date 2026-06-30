import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#83a2db",
};

export const metadata: Metadata = {
  title: "Nebula",
  description: "Scout, enrich, and outreach for B2B sales teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full stratus`}>
      <body className="min-h-full antialiased ish-mobile-body">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => { try { const t = localStorage.getItem('theme') || 'stratus'; const themes = ['light','stratus']; const root = document.documentElement; themes.forEach((name) => root.classList.remove(name)); if (themes.includes(t)) root.classList.add(t); else root.classList.add('stratus'); } catch { document.documentElement.classList.add('stratus'); } })();`}
        </Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
