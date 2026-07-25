import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const enterpriseFont = localFont({
  src: [
    { path: "./fonts/Tahoma.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Tahoma-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-enterprise",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "IFS Insight", template: "%s · IFS Insight" },
  description: "Governed Oracle intelligence and dashboard workspace for IFS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${enterpriseFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
