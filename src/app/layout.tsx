import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const jakarta = localFont({
  src: [
    {
      path: "./fonts/PlusJakartaSans-Variable.ttf",
      weight: "200 800",
      style: "normal",
    },
    {
      path: "./fonts/PlusJakartaSans-Italic-Variable.ttf",
      weight: "200 800",
      style: "italic",
    },
  ],
  variable: "--font-jakarta",
  display: "swap",
});

const dilemma = localFont({
  src: "./fonts/DilemmaSerifMedium.ttf",
  weight: "500",
  style: "normal",
  variable: "--font-dilemma",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Base Camp",
  description: "Base Camp — Ridge Music Group's internal booking and venue management tool",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${dilemma.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
