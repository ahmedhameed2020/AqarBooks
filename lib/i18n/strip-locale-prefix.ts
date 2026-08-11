import { routing, type Locale } from "@/i18n/routing";

// A pathname coming from middleware/searchParams (e.g. "/ar/dashboard")
// already includes its locale segment. next-intl's locale-aware redirect()
// and <Link> prepend the locale themselves, so passing such a path straight
// through doubles it into "/ar/ar/dashboard". Strip a leading locale
// segment before handing a path to either.
export function stripLocalePrefix(path: string): string {
  const match = path.match(/^\/([a-z]{2})(\/.*|$)/);
  if (match && routing.locales.includes(match[1] as Locale)) {
    return match[2] || "/";
  }
  return path;
}
