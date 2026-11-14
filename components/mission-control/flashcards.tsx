"use client";

import { useState } from "react";

const CARDS = [
  ["Solar illumination", "Sunlight reaching a surface. Near the lunar poles, low-angle light makes ridges and crater rims decisive for power and temperature.", "☼"],
  ["Azimuth", "The compass direction toward an object, measured around the horizon. It helps describe where the Sun or Earth appears from a landing site.", "◉"],
  ["Solar elevation", "The angle of the Sun above the local horizon. A small change can move the Sun behind a ridge or expose a site to light.", "△"],
  ["Horizon mask", "A profile of the terrain skyline in every direction. Anything below that skyline is hidden from the observer.", "⌁"],
  ["Line of sight", "An unobstructed path between two points. A lander needs a clear line of sight to Earth for direct communication.", "⌖"],
  ["Libration", "The Moon’s slow apparent wobble as seen from Earth. It shifts Earth’s position in the lunar sky and changes communication geometry.", "◌"],
  ["Ephemeris", "A time-based table or model of where a celestial body is expected to be. Shadowline plans to use JPL Horizons positions for the Sun and Earth.", "✳"],
  ["Direct-to-Earth (DTE)", "A communications link from a lunar surface asset directly to Earth. Terrain can block the low-angle path and create an outage.", "⌁"],
  ["Permanently shadowed region (PSR)", "A place where terrain blocks direct sunlight over very long periods. PSRs are scientifically valuable and require careful exploration planning.", "◐"],
  ["Lunar day", "The Moon’s roughly month-long day-night cycle. Near the poles, local terrain makes illumination vary sharply across short distances.", "◒"],
  ["Digital elevation model (DEM)", "A gridded representation of measured surface height. LOLA elevation data can provide terrain input for horizon calculations.", "▦"],
  ["Landing ellipse", "The region where a spacecraft may land given navigation and vehicle uncertainty. A site assessment must account for the wider area, not one point.", "⬡"],
] as const;

export function MissionFlashcards() {
  const [flipped, setFlipped] = useState<number[]>([]);
  return <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{CARDS.map(([term, definition, symbol], i) => {
    const isFlipped = flipped.includes(i);
    return <li key={term}><button type="button" aria-pressed={isFlipped} onClick={() => setFlipped((items) => isFlipped ? items.filter((n) => n !== i) : [...items, i])} className="mission-flashcard group w-full text-left" aria-label={`${term}: ${isFlipped ? "show term" : "flip to learn"}`}>
      <span className="mission-flashcard-inner" data-flipped={isFlipped}>
        <span className="mission-flashcard-face mission-flashcard-front"><span className="mission-flashcard-art" aria-hidden>{symbol}</span><span className="type-data text-xs text-violet-300">TOPIC 0{i + 1}</span><span className="type-heading mt-3 block text-2xl text-bone">{term}</span><span className="mt-6 block text-xs uppercase tracking-widest text-bone/50">Tap to reveal ↗</span></span>
        <span className="mission-flashcard-face mission-flashcard-back"><span className="type-data text-xs text-violet-300">THE CONCEPT</span><span className="mt-4 block leading-relaxed text-bone/85">{definition}</span><span className="mt-6 block text-xs uppercase tracking-widest text-violet-200">Tap to flip back</span></span>
      </span></button></li>;
  })}</ul>;
}
