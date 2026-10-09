"use client";

/*
  Lets a page say "I have unsaved changes". The sidebar asks before navigating away,
  and the browser asks before closing or reloading the tab (beforeunload).
  Lives in the app shell so the sidebar can read it without knowing about knowledge bases.
*/
import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface NavGuard {
  /** True when leaving would lose work */
  blocked: boolean;
  setBlocked: (blocked: boolean) => void;
  /** Returns true if it's OK to leave (nothing unsaved, or the user confirmed) */
  confirmLeave: () => boolean;
}

const NavGuardContext = createContext<NavGuard | null>(null);

const MESSAGE = "You have unsaved changes to your knowledge base. Leave without saving?";

export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!blocked) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault(); // browsers show their own generic "Leave site?" dialog
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [blocked]);

  const confirmLeave = useCallback(() => !blocked || window.confirm(MESSAGE), [blocked]);

  return <NavGuardContext.Provider value={{ blocked, setBlocked, confirmLeave }}>{children}</NavGuardContext.Provider>;
}

export function useNavGuard(): NavGuard {
  const ctx = useContext(NavGuardContext);
  if (!ctx) throw new Error("useNavGuard must be used inside NavGuardProvider");
  return ctx;
}
