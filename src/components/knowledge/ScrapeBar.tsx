"use client";

/*
  URL input + Scrape button. Validates as you submit using the same normalizeUrl
  the server uses (accepts "site.com" or "https://site.com", rejects junk).
*/
import { useState } from "react";
import { Globe, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { normalizeUrl } from "@/lib/scraper/url";

export function ScrapeBar({ loading, onScrape, initialUrl = "" }: { loading: boolean; onScrape: (url: string) => void; initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      onScrape(normalizeUrl(url));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That doesn't look like a valid website address.");
    }
  }

  return (
    <Card className="p-4 sm:p-5" data-tour="scrape">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor="scrape-url" className="sr-only">
            Website address
          </label>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              id="scrape-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="yourbusiness.com"
              inputMode="url"
              autoComplete="url"
              disabled={loading}
              aria-invalid={!!error}
              aria-describedby={error ? "scrape-url-error" : undefined}
              className={`h-12 w-full rounded-full border bg-card pl-10 pr-4 text-sm outline-none transition-shadow placeholder:text-subtle focus:shadow-glow disabled:bg-page ${
                error ? "border-danger" : "border-border focus:border-primary"
              }`}
            />
          </div>
          {error && (
            <p id="scrape-url-error" className="ml-4 mt-1.5 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" loading={loading} disabled={!url.trim()} icon={<Search className="size-4" />} className="h-12 px-6">
          {loading ? "Scraping…" : "Scrape website"}
        </Button>
      </form>
    </Card>
  );
}
