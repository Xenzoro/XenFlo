"use client";

/*
  Thin icon sidebar on the left (desktop) that becomes a bottom bar on phones.
  Links ask before leaving when the current page has unsaved changes.
*/
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, Library } from "lucide-react";
import { useNavGuard } from "@/context/NavGuardContext";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/knowledge", label: "Knowledge", icon: Brain },
  { href: "/knowledge/view", label: "Saved", icon: Library },
];

export function Sidebar() {
  const pathname = usePathname();
  const { confirmLeave } = useNavGuard();

  const links = NAV.map(({ href, label, icon: Icon }) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        onClick={(e) => {
          if (!active && !confirmLeave()) e.preventDefault();
        }}
        className={cn(
          "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition-colors",
          active ? "bg-primary-soft text-primary" : "text-subtle hover:bg-page hover:text-ink",
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    );
  });

  return (
    <>
      {/* Desktop: fixed thin column */}
      <nav className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center gap-2 border-r border-border bg-card pt-20 sm:flex">{links}</nav>
      {/* Phone: bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-card px-4 py-1.5 sm:hidden">{links}</nav>
    </>
  );
}
