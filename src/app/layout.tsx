import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sales Accelerator",
  description: "Scout, enrich, and outreach for B2B sales teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full stratus`}>
      <body className="min-h-full antialiased">
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const t = localStorage.getItem('theme') || 'stratus'; const themes = ['light','stratus']; const root = document.documentElement; themes.forEach((name) => root.classList.remove(name)); if (themes.includes(t)) root.classList.add(t); else root.classList.add('stratus'); } catch { document.documentElement.classList.add('stratus'); } })();`,
          }}
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
