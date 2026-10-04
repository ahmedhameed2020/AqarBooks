import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "../globals.css";

// Activation links live outside /[locale] on purpose: the URL has to be exactly
// https://aqarbooks.com/activate/<token> to work as an App Link / Universal
// Link, and the page picks Arabic or English itself.
export const metadata: Metadata = {
  title: "تفعيل حساب المالك · Owner account activation",
  // The token is in the URL: never index it, never leak it through Referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

const cairo = Cairo({ variable: "--font-cairo", subsets: ["arabic", "latin"], weight: ["400", "600", "700"], display: "swap" });

export default function ActivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen bg-muted/30 font-sans antialiased">{children}</body>
    </html>
  );
}
