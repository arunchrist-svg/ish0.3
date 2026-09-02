import type { Metadata } from "next";
import Script from "next/script";
import { Inter, Playfair_Display } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#f6f7fa" },
  ],
};

export const metadata: Metadata = {
  title: "Nebula",
  description: "Scout, enrich, and approve AI outreach from anywhere.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nebula",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${playfair.variable} h-full stratus`}>
      <body className="min-h-full antialiased ish-mobile-body">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => { try { const t = localStorage.getItem('theme') || 'stratus'; const themes = ['light','stratus']; const root = document.documentElement; themes.forEach((name) => root.classList.remove(name)); if (themes.includes(t)) root.classList.add(t); else root.classList.add('stratus'); } catch { document.documentElement.classList.add('stratus'); } })();`}
        </Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
