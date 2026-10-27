import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "BillLens PH - Hospital Statement Auditor & PhilHealth Assistant",
  description:
    "Transform complex Philippine hospital bills into transparent itemized audits with instant PhilHealth & Senior/PWD statutory checks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-slate-50/50 text-slate-900">
        <MobileContainer>
          <Header />
          <main className="flex-1 pb-24 md:pb-12 max-w-4xl lg:max-w-5xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
            {children}
          </main>
          <BottomNav />
        </MobileContainer>
      </body>
    </html>
  );
}
