/*
  Pick the logo that looks best in a small square tile (cards, table rows, the Company hero).
  The scraper ranks logos for brand accuracy, where wide header logos come first, but those
  are often white text meant for a dark header. Square icons read much better small.
*/
import type { Field, Logo } from "@/types/knowledge";

function tileRank(logo: Logo): number {
  const vector = /\.svg(\?|$)/i.test(logo.url);
  if (logo.kind === "apple-touch-icon") return 0;
  if (logo.kind === "favicon" && vector) return 1;
  if (logo.kind === "header logo" || logo.kind === "logo image" || logo.kind === "json-ld logo") return 2;
  if (logo.kind === "header image") return 3;
  if (logo.kind === "favicon") return 4; // often a blurry 16px .ico
  return 9; // og:image is a wide social banner, never a logo tile
}

export function pickIconLogo(logos: Field<Logo>[] | null | undefined): string | null {
  const candidates = (logos ?? []).flatMap((l) => (l.value ? [l.value] : [])).filter((l) => tileRank(l) < 9);
  candidates.sort((a, b) => tileRank(a) - tileRank(b)); // stable: keeps the scraper's order within a rank
  return candidates[0]?.url ?? null;
}

/**
 * A key that's the same for different URLs of the same image, so duplicates can be grouped:
 * "Goettl-Logo-2-e1791311615782.png" and "Goettl-Logo-2.png" (WordPress crop), "icon-192x192.png"
 * and "icon-80x80.png" (WordPress sizes), and Wix "/media/<id>/v1/fill/w_406,.../name.png" resizes.
 */
export function logoKey(url: string): string {
  let path: string;
  try {
    const u = new URL(url);
    path = u.hostname + u.pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  path = path.toLowerCase();
  // Wix serves resized copies under the same media id: keep just ".../media/<id>"
  const wix = path.match(/\/media\/[^/]+/);
  if (wix) return wix[0];
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash + 1);
  const file = path
    .slice(slash + 1)
    .replace(/\.[a-z0-9]+$/, "") // extension (.png vs .webp copies)
    .replace(/^cropped-/, "")
    .replace(/(-\d+x\d+)+$/, "") // WordPress size suffixes, possibly repeated
    .replace(/-e\d{10,}$/, "") // WordPress crop suffix
    .replace(/-scaled$/, "")
    .replace(/(-\d+x\d+)+$/, "");
  return dir + file;
}
