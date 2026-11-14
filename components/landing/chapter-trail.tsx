import Link from "next/link";
import { cn } from "@/lib/utils";

const CHAPTERS = [
  { id: "overview", label: "Briefing", href: "#overview" },
  { id: "mission", label: "Surface", href: "#overview-guide" },
  { id: "explore", label: "Routes", href: "#explore" },
  { id: "science", label: "Signals", href: "#how-it-works" },
  { id: "launch", label: "Launch", href: "#launch" },
] as const;

/** Small, clickable mission path repeated at each landing-page chapter. */
export function ChapterTrail({ active }: { active: (typeof CHAPTERS)[number]["id"] }) {
  return (
    <nav aria-label="Mission sequence" className="chapter-trail">
      <ol>
        {CHAPTERS.map((chapter, index) => {
          const isActive = chapter.id === active;
          return (
            <li key={chapter.id}>
              <Link
                href={chapter.href}
                aria-current={isActive ? "step" : undefined}
                className={cn("chapter-stop", isActive && "chapter-stop-active")}
              >
                <span className="chapter-node type-data">0{index + 1}</span>
                <span className="chapter-label">{chapter.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
