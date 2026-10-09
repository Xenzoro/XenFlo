import Link from "next/link";

// Placeholder home page. The real UI lives at /knowledge (built in a later phase).
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          XenFlo
        </p>
        <h1 className="mt-2 text-2xl font-bold">Knowledge Builder</h1>
        <p className="mt-2 text-sm text-muted">
          Paste your website and Flo builds your knowledge base.
        </p>
        <Link
          href="/knowledge"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}
