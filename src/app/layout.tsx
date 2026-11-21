import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { AppProviders } from "@/components/providers/AppProviders";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BillLens PH - Hospital Statement Auditor & PhilHealth Assistant",
  description:
    "Transform complex Philippine hospital bills into transparent itemized audits with instant PhilHealth & Senior/PWD statutory checks.",
  icons: {
    icon: [
      { url: "/favicon.ico?v=2" },
      { url: "/icon.png?v=2", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png?v=2", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#F8FAFC] print:bg-white text-[#1E293B]">
        <AppProviders>
          <MobileContainer>
            <Header />
            <main className="flex-1 pb-28 lg:pb-12 print:pb-0 print:px-0 print:py-0 print:max-w-none w-full max-w-none px-4 sm:px-6 lg:px-10 xl:px-14 py-4 sm:py-6">
              {children}
            </main>
            <BottomNav />
          </MobileContainer>
        </AppProviders>
      </body>
    </html>
  );
}
