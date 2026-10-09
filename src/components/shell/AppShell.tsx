import { NavGuardProvider } from "@/context/NavGuardContext";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Page frame: top bar, icon sidebar, and a padded content area on the light gray background. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NavGuardProvider>
      <TopBar />
      <Sidebar />
      {/* Offsets: 4rem for the top bar, 5rem for the sidebar on desktop, room for the bottom bar on phones */}
      <main className="min-h-screen px-4 pb-24 pt-20 sm:pb-10 sm:pl-24 sm:pr-6 lg:pl-28 lg:pr-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </NavGuardProvider>
  );
}
