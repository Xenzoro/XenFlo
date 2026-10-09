/*
  Simple outline icons for social platforms, drawn in the same 24px stroke style as Lucide.
  (Lucide removed brand logos, so these are hand-drawn approximations, not official marks.)
*/
import { Globe } from "lucide-react";
import type { SocialPlatform } from "@/types/knowledge";

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X (Twitter)",
  youtube: "YouTube",
  tiktok: "TikTok",
  twitch: "Twitch",
  discord: "Discord",
  pinterest: "Pinterest",
  other: "Website",
};

// Brand colors for the icon tiles
export const PLATFORM_COLOR: Record<SocialPlatform, string> = {
  linkedin: "#0a66c2",
  facebook: "#1877f2",
  instagram: "#e1306c",
  x: "#111827",
  youtube: "#ff0000",
  tiktok: "#111827",
  twitch: "#9146ff",
  discord: "#5865f2",
  pinterest: "#e60023",
  other: "#6b7280",
};

const PATHS: Partial<Record<SocialPlatform, React.ReactNode>> = {
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" />
    </>
  ),
  facebook: <path d="M15 3h-2a4 4 0 0 0-4 4v3H7v3h2v8h3v-8h3l1-3h-4V7.5A1 1 0 0 1 13 6.5h2z" />,
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5v.01" />
    </>
  ),
  x: <path d="M4 4l16 16M20 4L4 20" />,
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M10 9l5 3-5 3z" />
    </>
  ),
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c0 2.5 2 4.5 5 4.5" />,
  twitch: (
    <>
      <path d="M4 3h16v11l-4 4h-4l-3 3v-3H4z" />
      <path d="M11 8v4M15 8v4" />
    </>
  ),
  discord: (
    <>
      <path d="M7 6c3-1.3 7-1.3 10 0 2 3 3 6 3 10-2 1.5-4 2.3-5.5 2.5l-1-2M7 6c-2 3-3 6-3 10 2 1.5 4 2.3 5.5 2.5l1-2" />
      <path d="M9.5 12.5v.01M14.5 12.5v.01" />
    </>
  ),
  pinterest: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M11 8.5c3-1 5 .5 4.5 3s-3 3-4.5 2M11.5 9L9 20" />
    </>
  ),
};

export function SocialIcon({ platform, className = "size-4" }: { platform: SocialPlatform; className?: string }) {
  const path = PATHS[platform];
  if (!path) return <Globe className={className} />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {path}
    </svg>
  );
}

/** Guess the platform from a profile URL the user typed. */
export function detectPlatform(url: string): SocialPlatform {
  const host = url.toLowerCase();
  if (host.includes("linkedin.")) return "linkedin";
  if (host.includes("facebook.") || host.includes("fb.com")) return "facebook";
  if (host.includes("instagram.")) return "instagram";
  if (host.includes("twitter.") || /(^|\/\/|\.)x\.com/.test(host)) return "x";
  if (host.includes("youtube.") || host.includes("youtu.be")) return "youtube";
  if (host.includes("tiktok.")) return "tiktok";
  if (host.includes("twitch.")) return "twitch";
  if (host.includes("discord.")) return "discord";
  if (host.includes("pinterest.")) return "pinterest";
  return "other";
}
