"use client";

import React from "react";
import { ScanBackgroundProvider } from "./ScanBackgroundProvider";
import { ChatbotBackgroundProvider } from "./ChatbotBackgroundProvider";
import { BackgroundScanToast } from "./BackgroundScanToast";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ScanBackgroundProvider>
      <ChatbotBackgroundProvider>
        {children}
        <BackgroundScanToast />
      </ChatbotBackgroundProvider>
    </ScanBackgroundProvider>
  );
}
