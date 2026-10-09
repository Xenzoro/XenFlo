/*
  Remembers that this browser finished (or skipped) the tour.
  localStorage can throw (private mode, blocked storage), so every access is guarded;
  if it fails we fall back to memory, which lasts until the page reloads.
*/
const KEY = "xenflo.tour.v1";
let memoryDone = false;

export function isTourDone(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "done" || memoryDone;
  } catch {
    return memoryDone;
  }
}

export function markTourDone(): void {
  memoryDone = true;
  try {
    window.localStorage.setItem(KEY, "done");
  } catch {
    // storage unavailable: the in-memory flag still stops it re-opening this visit
  }
}

/** Fired by the "Take a tour" link; the tour listens for it. */
export const TOUR_EVENT = "xenflo:tour";
