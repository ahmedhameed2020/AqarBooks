"use client";

import { useEffect } from "react";

export async function registerGateScannerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  return navigator.serviceWorker.register("/gate-scanner-sw.js", {
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
