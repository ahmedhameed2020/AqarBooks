import Image from "next/image";
import { LogoMark } from "@/components/marketing/logo-mark";

/**
 * Full-bleed photograph at full opacity. Legibility comes from a scrim anchored
 * to the edges where type actually sits, not from dimming the whole image --
 * a globally darkened photo reads as a background, not as a picture.
 */
export function BrandPanel({ isAr, brandName }: { isAr: boolean; brandName: string }) {
  return (
    <div className="relative h-full overflow-hidden bg-[#060a18]">
      <Image
        src="/images/aqarbooks-hero.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 0px"
        className="object-cover"
        style={{ objectPosition: "68% 50%" }}
      />

      {/* Scrims: bottom carries the headline, top carries the wordmark. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-[#04060f] via-[#04060f]/88 to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/50 to-transparent"
      />

      <div className="absolute top-12 start-12 flex items-center gap-3 lg:top-16 lg:start-16">
        <LogoMark className="size-9" />
        <span className="text-lg font-extrabold tracking-tight text-white drop-shadow-sm">
          {brandName}
        </span>
      </div>

      <p className="absolute bottom-16 start-12 end-12 max-w-lg text-balance text-3xl font-extrabold leading-[1.3] text-white lg:bottom-20 lg:start-16 lg:end-16 lg:text-4xl">
        {isAr
          ? "عقاراتك تستحق دفاتر بمستواها."
          : "Your properties deserve books to match."}
      </p>
    </div>
  );
}
