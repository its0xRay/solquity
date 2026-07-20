import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solquity",
  description: "What tokenized equities can do across Solana.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
