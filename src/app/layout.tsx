import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Base Camp",
  description: "The Ridge Music Group's internal CRM",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
