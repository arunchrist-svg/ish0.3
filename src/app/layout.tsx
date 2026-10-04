import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const THEME_INIT = `(() => { try { const t = localStorage.getItem('theme') || 'stratus'; const themes = ['light','stratus']; const root = document.documentElement; themes.forEach((name) => root.classList.remove(name)); if (themes.includes(t)) root.classList.add(t); else root.classList.add('stratus'); } catch { document.documentElement.classList.add('stratus'); } })();`;

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
      <head>
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full antialiased ish-mobile-body">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
