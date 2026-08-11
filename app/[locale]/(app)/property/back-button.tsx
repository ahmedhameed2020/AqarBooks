"use client";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function BackButton({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const router = useRouter();

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
      <ArrowRight className="size-3.5 rtl:-scale-x-100" />
      {isAr ? "رجوع للوحدات" : "Back to units"}
    </Button>
  );
}
