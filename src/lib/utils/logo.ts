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
