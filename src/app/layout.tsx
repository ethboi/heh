import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beat This Price | Hotel Price Checker",
  description:
    "Compare your current hotel deal against live trivago accommodation pricing.",
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
