/*
  Color parsing for brand color detection. Sites write colors as hex, rgb(),
  or (Tailwind v4) oklch(); everything is normalized to "#rrggbb".
*/

export type Rgb = [number, number, number];

const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** Parse one CSS color value into hex, or null if it isn't a plain color. */
export function parseColor(value: string): string | null {
  const v = value.trim().toLowerCase();

  const hex = v.match(/^#([0-9a-f]{3,8})\b/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6); // drop alpha
    return h.length === 6 ? `#${h}` : null;
  }

  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (rgb) return toHex([Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]);

  const oklch = v.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
  if (oklch) {
    const l = Number(oklch[1]) / (oklch[2] ? 100 : 1);
    return toHex(oklchToRgb(l, Number(oklch[3]), Number(oklch[4])));
  }
  return null;
}

/** OKLCH -> sRGB (0-255), using the standard OKLab matrices. */
function oklchToRgb(L: number, C: number, H: number): Rgb {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055)) as Rgb;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Grays, near-black and near-white: real colors but not "brand" colors. */
export function isNeutral(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  return sat < 0.25 || light > 0.95 || light < 0.08;
}

/** Colors this close (RGB distance) count as the same swatch. */
export function isSimilar(a: string, b: string): boolean {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 40;
}
