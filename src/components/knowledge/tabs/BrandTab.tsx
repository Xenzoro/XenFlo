"use client";

/** Brand: colors as swatches, logos as images (on a dark backdrop when they're white), fonts in their own face, social links as icons. */
import type { Logo, SocialLink } from "@/types/knowledge";
import { useList } from "@/context/KnowledgeContext";
import { SectionCard, SectionLabel } from "@/components/ui/Card";
import { EditableField } from "@/components/ui/EditableField";
import { EditableList } from "@/components/ui/EditableList";
import { RecordList } from "@/components/ui/RecordList";
import { PLATFORM_COLOR, PLATFORM_LABEL, SocialIcon, detectPlatform } from "@/components/ui/SocialIcon";
import { logoKey } from "@/lib/utils/logo";
import { FontPreview } from "../FontPreview";
import { LogoPreview } from "../LogoPreview";

const validHex = (t: string) => (/^#?[0-9a-f]{6}$|^#?[0-9a-f]{3}$/i.test(t) ? null : "Use a hex color like #2563eb.");
const toHex = (t: string) => (t.startsWith("#") ? t : `#${t}`).toLowerCase();
const PRIMARY_COUNT = 3;
// Shared by the Primary and Secondary lists (both edit brand.colors)
const colorListProps = {
  addLabel: "color",
  placeholder: "#2563eb",
  validate: validHex,
  parse: toHex,
  render: (hex: string) => (
    <span className="inline-flex items-center gap-1.5 font-mono">
      <span className="size-3.5 rounded-full border border-black/10" style={{ background: hex }} />
      {hex}
    </span>
  ),
};

export function BrandTab() {
  const colors = useList<string>("brand.colors");
  const socials = useList<SocialLink>("brand.socialLinks");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SectionCard title="Brand colors" subtitle="Click a color to change it">
        {colors.length > 0 && (
          // Big palette strip for a quick look at the whole palette
          <div className="mb-4 flex h-14 overflow-hidden rounded-2xl border border-border">
            {colors.map((c, i) => c.value && <div key={i} className="flex-1" style={{ background: c.value }} title={c.value} />)}
          </div>
        )}
        {/* Colors are ranked by use (buttons, header, links), so the first three are the main brand colors */}
        <SectionLabel className="mb-2">Primary</SectionLabel>
        <EditableList path="brand.colors" canAdd={colors.length < PRIMARY_COUNT} filter={(_, i) => i < PRIMARY_COUNT} {...colorListProps} />
        {colors.length >= PRIMARY_COUNT && (
          <>
            <SectionLabel className="mb-2 mt-4">Secondary</SectionLabel>
            <EditableList path="brand.colors" filter={(_, i) => i >= PRIMARY_COUNT} {...colorListProps} />
          </>
        )}
        <p className="mt-3 text-[11px] text-subtle">Ranked by how much your site uses them on buttons, headers and links.</p>
      </SectionCard>

      <SectionCard title="Logos" subtitle="Found in your header, social tags and favicon">
        <RecordList<Logo>
          path="brand.logos"
          columns={2}
          addLabel="logo URL"
          blank={{ url: "", kind: "added by you", alt: null }}
          fields={[
            { key: "url", label: "Image URL", required: true, placeholder: "https://…/logo.png" },
            { key: "alt", label: "Description" },
          ]}
          // The same image is often found several times (header, JSON-LD, favicon): show it once
          groupBy={(logo) => logoKey(logo.url)}
          render={(logo, group) => (
            <div>
              <LogoPreview url={logo.url} alt={logo.alt} />
              <p className="mt-2 text-xs text-muted">{[...new Set(group.map((l) => l.kind))].join(" · ")}</p>
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Fonts" subtitle="Shown in the font itself when we can load it">
        <EditableList path="brand.fonts" variant="rows" addLabel="font" placeholder="e.g. Poppins" render={(f) => <FontPreview family={f} />} />
      </SectionCard>

      <SectionCard title="Social links" subtitle="Where your customers follow you">
        {socials.some((s) => s.value) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {socials.map(
              (s, i) =>
                s.value && (
                  <a
                    key={i}
                    href={s.value.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={PLATFORM_LABEL[s.value.platform]}
                    className="flex size-10 items-center justify-center rounded-full text-white transition-transform hover:scale-110"
                    style={{ background: PLATFORM_COLOR[s.value.platform] }}
                  >
                    <SocialIcon platform={s.value.platform} />
                  </a>
                ),
            )}
          </div>
        )}
        <EditableList<SocialLink>
          path="brand.socialLinks"
          variant="rows"
          addLabel="social link"
          placeholder="https://instagram.com/yourbusiness"
          format={(s) => s.url}
          parse={(url) => ({ url, platform: detectPlatform(url) })}
          render={(s) => (
            <span className="flex min-w-0 items-center gap-2">
              <SocialIcon platform={s.platform} className="size-3.5 shrink-0 text-muted" />
              <span className="truncate">{s.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
            </span>
          )}
        />
      </SectionCard>

      <SectionCard title="Voice and style" subtitle="How your brand sounds and looks" className="md:col-span-2">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <EditableField path="brand.writingStyle" label="Writing style" kind="textarea" emptyLabel="writing style" />
          <EditableField path="brand.artStyle" label="Art style" kind="textarea" emptyLabel="art style" />
        </div>
      </SectionCard>
    </div>
  );
}
