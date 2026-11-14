import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { EXPERIENCES, type Experience } from "@/data/site";

/** Cross-links to the other modes, shown at the foot of each experience page. */
export function OtherExperiences({ current }: { current: Experience["id"] }) {
  const others = EXPERIENCES.filter((e) => e.id !== current);
  return (
    <section aria-labelledby="other-experiences" className="border-t border-line py-16 sm:py-20">
      <PageContainer>
        <h2 id="other-experiences" className="text-sm font-medium text-bone">
          Other ways to explore
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {others.map((e) => (
            <li key={e.id}>
              <Link
                href={e.href}
                className="group flex h-full flex-col rounded-lg border border-line p-6 transition-colors duration-300 hover:border-bone/30 hover:bg-charcoal/50"
              >
                <span className="type-data text-xs text-bone/55">{e.index}</span>
                <span className="type-heading mt-3 text-xl text-bone">{e.title}</span>
                <span className="mt-2 text-muted-foreground">{e.subtitle}</span>
                <span className="mt-6 text-sm text-bone underline decoration-bone/30 underline-offset-4 transition-colors group-hover:decoration-sun">
                  {e.cta}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
