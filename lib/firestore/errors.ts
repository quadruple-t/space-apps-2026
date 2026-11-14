import type { ChapterId } from "@/lib/model/types";

/** A required static document is missing (e.g. an ephemeris chunk the pipeline has not produced yet). */
export class DocumentNotFoundError extends Error {
  readonly code = "not-found";
  constructor(readonly path: string) {
    super(`Firestore document not found: ${path}`);
    this.name = "DocumentNotFoundError";
  }
}

/** A stored document does not match the expected shape (bad enum, wrong Bytes length, ...). */
export class DocumentShapeError extends Error {
  readonly code = "bad-shape";
  constructor(
    readonly path: string,
    detail: string,
  ) {
    super(`Malformed Firestore document ${path}: ${detail}`);
    this.name = "DocumentShapeError";
  }
}

/** Chapters must be completed in order: ch1 -> ch2 -> ch3. */
export class ChapterOrderError extends Error {
  readonly code = "chapter-order";
  constructor(
    readonly chapterId: ChapterId,
    readonly requires: ChapterId,
  ) {
    super(`Complete ${requires} before ${chapterId}.`);
    this.name = "ChapterOrderError";
  }
}

/** Input rejected before it reaches Firestore (mirrors the security rules). */
export class InvalidUserDataError extends Error {
  readonly code = "invalid-user-data";
  constructor(detail: string) {
    super(detail);
    this.name = "InvalidUserDataError";
  }
}
