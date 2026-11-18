import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { AppProviders } from "@/components/providers/AppProviders";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "BillLens PH - Hospital Statement Auditor & PhilHealth Assistant",
  description:
    "Transform complex Philippine hospital bills into transparent itemized audits with instant PhilHealth & Senior/PWD statutory checks.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-[#F3F4F6] print:bg-white text-[#1E293B]">
        <AppProviders>
          <MobileContainer>
            <Header />
            <main className="flex-1 pb-24 md:pb-12 print:pb-0 print:px-0 print:py-0 print:max-w-none max-w-5xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6">
              {children}
            </main>
            <BottomNav />
          </MobileContainer>
        </AppProviders>
      </body>
    </html>
  );
}
