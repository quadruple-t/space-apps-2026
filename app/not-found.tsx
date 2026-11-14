import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="flex min-h-[80svh] items-center pt-24">
      <PageContainer>
        <p className="type-data text-sm text-bone/55">404 · beyond the horizon</p>
        <h1 className="type-display mt-4 text-[clamp(2.4rem,6vw,5rem)] text-bone">Signal lost.</h1>
        <p className="mt-6 max-w-lg text-lg text-muted-foreground">
          This page is out of line of sight. Check the address, or head back to the surface.
        </p>
        <Button asChild size="xl" className="mt-10">
          <Link href="/">Back to Shadowline</Link>
        </Button>
      </PageContainer>
    </section>
  );
}
