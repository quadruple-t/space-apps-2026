import type { Metadata } from "next";
import { PageIntro } from "@/components/experience/page-intro";
import { PageContainer } from "@/components/layout/page-container";
import { ExpeditionsClient } from "./expeditions-client";

export const metadata: Metadata = {
  title: "My expeditions",
  description: "Open, rename or delete the expeditions saved to your account. Signing in is optional.",
};

export default function ExpeditionsPage() {
  return (
    <>
      <PageIntro title="My expeditions" lede="Your saved planning work." status={null}>
        <p>
          An expedition keeps a Freeplay workspace: its sites, time window, layers, notes, saved comparisons and
          Mission Control chat. Signing in is optional; without an account your work autosaves in this browser.
        </p>
      </PageIntro>
      <section aria-labelledby="expedition-list" className="py-12 sm:py-16">
        <PageContainer>
          <h2 id="expedition-list" className="sr-only">Expeditions</h2>
          <ExpeditionsClient />
        </PageContainer>
      </section>
    </>
  );
}
