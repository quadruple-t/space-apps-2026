import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { FOOTER_LINKS, SITE } from "@/data/site";
import { PageContainer } from "./page-container";

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-bone">{title}</h2>
      <ul className="mt-4 space-y-1">
        {links.map((l) => {
          const external = l.href.startsWith("http");
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-flex min-h-9 items-center text-sm text-muted-foreground transition-colors hover:text-bone"
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {l.label}
                {external && <span className="sr-only"> (opens in a new tab)</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-void">
      <PageContainer className="grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{SITE.description}</p>
        </div>
        <FooterColumn title="Experiences" links={FOOTER_LINKS.experiences} />
        <FooterColumn title="About the project" links={FOOTER_LINKS.project} />
        <FooterColumn title="Data & resources" links={FOOTER_LINKS.resources} />
      </PageContainer>
      <PageContainer className="flex flex-col gap-2 border-t border-line py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Built for the {SITE.hackathon}.</p>
        <p>Visuals are conceptual. Not affiliated with or endorsed by NASA.</p>
      </PageContainer>
    </footer>
  );
}
