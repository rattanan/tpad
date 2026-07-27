import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { APP_VERSION } from "@/lib/app-version";
import SaveSuccessNotifier from "@/components/shared/save-success-notifier";

const enterpriseFont = localFont({
  src: [
    { path: "./fonts/Tahoma.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Tahoma-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-enterprise",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "InsightFS", template: "%s · InsightFS" },
  description: "Governed Oracle intelligence and dashboard workspace for IFS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${enterpriseFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col"><SaveSuccessNotifier />{children}<footer className="global-version-footer">InsightFS <span>·</span> Version {APP_VERSION}</footer></body>
    </html>
  );
}
