"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_LINKS } from "@/data/site";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-(--nav-height) transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled || !isHome
          ? "border-b border-line/80 bg-void/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-full max-w-[1320px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12"
      >
        <Link href="/" aria-label="Lunaris360 home" className="rounded-sm">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative inline-flex h-10 items-center rounded-sm px-3 text-sm transition-colors duration-200",
                    isActive ? "text-bone" : "text-muted-foreground hover:text-bone",
                  )}
                >
                  {link.label}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-3 bottom-1.5 h-px origin-left bg-sun transition-transform duration-300 ease-out",
                      isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100 group-hover:bg-bone/50",
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Open navigation menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[86vw] max-w-sm border-line bg-void p-0">
              <div className="flex h-(--nav-height) items-center border-b border-line px-6">
                <Logo />
              </div>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
<<<<<<< HEAD
              <SheetDescription className="sr-only">Open a Shadowline page.</SheetDescription>
=======
              <SheetDescription className="sr-only">Jump to a section or open a Lunaris360 experience.</SheetDescription>
>>>>>>> origin/tdubs
              <ul className="flex flex-col px-3 py-4">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <SheetClose asChild>
                      <Link
                        href={link.href}
                        className="flex h-12 items-center rounded-sm px-3 font-heading text-lg font-semibold uppercase tracking-wide text-bone [font-variation-settings:'wdth'_115] hover:bg-bone/5"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
