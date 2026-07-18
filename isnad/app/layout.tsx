import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Isnad — Ask, and trace the answer",
  description:
    "An Islamic knowledge assistant that answers from the Qur'an, authentic Sunnah, and the understanding of the Companions and early scholars — with sources shown, and disagreement never hidden.",
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
