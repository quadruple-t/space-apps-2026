import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ExpeditionBridgeLoader } from "@/components/expeditions/expedition-bridge-loader";
import { SiteFrame } from "@/components/layout/site-frame";
import { SITE } from "@/data/site";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Lunaris360",
    template: "%s · Lunaris360",
  },
  description: SITE.description,
  applicationName: SITE.name,
};

export const viewport: Viewport = {
  themeColor: "#080712",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <SiteFrame>{children}</SiteFrame>
        <ExpeditionBridgeLoader />
      </body>
    </html>
  );
}
