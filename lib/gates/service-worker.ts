"use client";

import { useEffect } from "react";

export async function registerGateScannerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  const version = process.env.NEXT_PUBLIC_GATE_BUILD ?? "development";
  return navigator.serviceWorker.register(`/gate-scanner-sw.js?build=${encodeURIComponent(version)}`, {
    scope: "/",
    updateViaCache: "none",
  });
}

export function GateScannerServiceWorkerRegistration() {
  useEffect(() => {
    void registerGateScannerServiceWorker().catch(() => {
      // A missing worker must never change scanner authorization behavior.
    });
  }, []);

  return null;
}
