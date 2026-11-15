"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Point = { x: number; y: number };
type Segment = { from: Point; control1: Point; control2: Point; to: Point; length: number };
type Motion = { path: string; points: Point[]; width: number; height: number; progress: number; traveler: Point };

const STAR = "M 0 -6 L 1.6 -1.6 L 6 0 L 1.6 1.6 L 0 6 L -1.6 1.6 L -6 0 L -1.6 -1.6 Z";
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function cubic(segment: Segment, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * segment.from.x + 3 * inverse ** 2 * t * segment.control1.x + 3 * inverse * t ** 2 * segment.control2.x + t ** 3 * segment.to.x,
    y: inverse ** 3 * segment.from.y + 3 * inverse ** 2 * t * segment.control1.y + 3 * inverse * t ** 2 * segment.control2.y + t ** 3 * segment.to.y,
  };
}

function makeSegment(from: Point, to: Point): Segment {
  const gap = to.y - from.y;
  const side = to.x >= from.x ? 1 : -1;
  const segment: Segment = {
    from,
    control1: { x: from.x + side * 13, y: from.y + gap * 0.36 },
    control2: { x: to.x - side * 13, y: to.y - gap * 0.36 },
    to,
    length: 0,
  };
  let previous = from;
  for (let step = 1; step <= 20; step += 1) {
    const current = cubic(segment, step / 20);
    segment.length += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }
  return segment;
}

/** A decorative page-length constellation. Its traveler follows the reader's scroll position. */
export function ScrollConstellation() {
  const [mounted, setMounted] = useState(false);
  const [motion, setMotion] = useState<Motion>({ path: "", points: [], width: 0, height: 0, progress: 0, traveler: { x: 0, y: 0 } });

  useEffect(() => {
    setMounted(true);
    let frame = 0;
    const update = () => {
      frame = 0;
      const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-constellation-node]"));
      if (sections.length < 2) return;

      const width = window.innerWidth;
      const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const points = sections.map((section, index) => ({
        x: width < 768 ? 7 + (index % 2) * 5 : 20 + (index % 2) * 9,
        y: section.getBoundingClientRect().top + window.scrollY + Math.min(84, Math.max(48, section.offsetHeight * 0.12)),
      }));
      const segments = points.slice(0, -1).map((point, index) => makeSegment(point, points[index + 1]));
      const path = segments.map((segment, index) => `${index === 0 ? `M ${segment.from.x} ${segment.from.y}` : ""} C ${segment.control1.x} ${segment.control1.y} ${segment.control2.x} ${segment.control2.y} ${segment.to.x} ${segment.to.y}`).join(" ");
      const cumulative = [0];
      for (const segment of segments) cumulative.push(cumulative[cumulative.length - 1] + segment.length);
      const totalLength = cumulative[cumulative.length - 1] || 1;
      const readingLine = window.scrollY + window.innerHeight * 0.42;

      let traveler = points[0];
      let distance = 0;
      if (readingLine >= points[points.length - 1].y) {
        traveler = points[points.length - 1];
        distance = totalLength;
      } else {
        for (let index = 0; index < segments.length; index += 1) {
          const from = points[index];
          const to = points[index + 1];
          if (readingLine < from.y || readingLine > to.y) continue;
          let portion = clamp((readingLine - from.y) / Math.max(1, to.y - from.y), 0, 1);
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) portion = portion < 0.5 ? 0 : 1;
          traveler = cubic(segments[index], portion);
          distance = cumulative[index] + segments[index].length * portion;
          break;
        }
      }

      setMotion({ path, points, width, height, progress: distance / totalLength, traveler });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    document.querySelectorAll<HTMLElement>("[data-constellation-node]").forEach((section) => observer.observe(section));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  if (!mounted || !motion.path) return null;
  return createPortal(
    <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-[8] block" viewBox={`0 0 ${motion.width} ${motion.height}`} preserveAspectRatio="none" style={{ width: motion.width, height: motion.height }}>
      <defs>
        <linearGradient id="landing-constellation-gradient" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--retro-blue)" />
          <stop offset="58%" stopColor="var(--retro-purple)" />
          <stop offset="100%" stopColor="var(--retro-red)" />
        </linearGradient>
      </defs>
      <path d={motion.path} pathLength={100} fill="none" stroke="var(--retro-blue)" strokeOpacity="0.28" strokeWidth="1.2" strokeDasharray="1 5" strokeLinecap="round" />
      <path d={motion.path} pathLength={100} fill="none" stroke="url(#landing-constellation-gradient)" strokeWidth="2" strokeDasharray="100" strokeDashoffset={100 - motion.progress * 100} strokeLinecap="round" />
      {motion.points.map((point, index) => <g key={`${point.x}-${point.y}`} transform={`translate(${point.x} ${point.y})`}>
        <circle r="9" fill="var(--retro-blue)" opacity="0.08" />
        <path d={STAR} fill={index === motion.points.length - 1 ? "var(--retro-purple)" : "var(--bone)"} opacity="0.76" />
      </g>)}
      <circle cx={motion.traveler.x} cy={motion.traveler.y} r="12" fill="var(--retro-blue)" opacity="0.22" />
      <path d={STAR} transform={`translate(${motion.traveler.x} ${motion.traveler.y}) scale(1.25)`} fill="var(--retro-red)" />
    </svg>,
    document.body,
  );
}
