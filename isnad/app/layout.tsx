import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://isnadsunnah.vercel.app"),
  title: {
    default: "Isnad — Islamic knowledge traced to its source",
    template: "%s | Isnad",
  },
  description:
    "An evidence-based Islamic knowledge assistant grounded in the Qur'an, authentic Sunnah, the understanding of the Companions, and recognized Sunni scholarship.",
  applicationName: "Isnad",
  keywords: [
    "Islamic AI",
    "Quran",
    "Sunnah",
    "Hadith",
    "Tafsir",
    "Fiqh",
    "Islamic knowledge",
  ],
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Isnad",
    title: "Isnad — Islamic knowledge traced to its source",
    description:
      "Ask questions about Islam with evidence from the Qur'an, authentic Sunnah, the Companions, and recognized scholarship.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Isnad — Islamic knowledge traced to its source",
    description:
      "Evidence-based Islamic answers across the web, Telegram bot, and Telegram Mini App.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Isnad",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#050806",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
