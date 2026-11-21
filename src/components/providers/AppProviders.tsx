"use client";

import React from "react";
import { ScanBackgroundProvider } from "./ScanBackgroundProvider";
import { ChatbotBackgroundProvider } from "./ChatbotBackgroundProvider";
import { ToastProvider } from "./ToastProvider";
import { BackgroundScanToast } from "./BackgroundScanToast";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ScanBackgroundProvider>
        <ChatbotBackgroundProvider>
          {children}
          <BackgroundScanToast />
        </ChatbotBackgroundProvider>
      </ScanBackgroundProvider>
    </ToastProvider>
  );
}
