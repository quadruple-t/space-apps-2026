"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname === "/explore";

  return <>
    <a href="#main" className="sr-only z-50 rounded-sm bg-bone px-4 py-2 text-sm font-medium text-void focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    {!immersive && <Navbar />}
    <div id="main" tabIndex={-1} className={immersive ? "fixed inset-0 z-40 h-dvh overflow-hidden outline-none" : "flex-1 outline-none"}>
      {children}
    </div>
    {!immersive && <Footer />}
  </>;
}
