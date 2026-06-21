import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteTitle = "PalmPay Coffee Experiment";
const siteDescription =
  "Coffee checkout prototype for a POS payment experiment with QR + PIN, NFC card, face recognition, and PalmPay palm-vein payment.";

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    template: "%s | PalmPay",
  },
  description: siteDescription,
  applicationName: "PalmPay Checkout Demo",
  authors: [{ name: "PalmPay Research Team" }],
  creator: "PalmPay Research Team",
  publisher: "PalmPay Research Team",
  keywords: [
    "PalmPay",
    "palm vein payment",
    "coffee checkout",
    "POS experiment",
    "biometric payment",
    "QR payment",
    "NFC card",
    "Face ID",
  ],
  category: "research demo",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/palmpay-mark.svg", type: "image/svg+xml", sizes: "64x64" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PalmPay Demo",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: "PalmPay Checkout Demo",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#6F3F24",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background">{children}</body>
    </html>
  );
}
