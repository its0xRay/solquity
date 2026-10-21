import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@/components/analytics";

export const metadata: Metadata = {
  title: "Solquity",
  description: "What tokenized equities can do across Solana.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}<Analytics /></body>
    </html>
  );
}
