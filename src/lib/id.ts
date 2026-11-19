let counter = 0;

/** A short id that is unique on this phone, for example "m3x9k2-4f8q1z-7". */
export function newId() {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${counter.toString(36)}`;
}
