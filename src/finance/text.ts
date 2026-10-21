/** Lowercase, drop digits and punctuation, collapse spaces: "Pathao Ride #12" -> "pathao ride". */
export const normalizeDesc = (s: string): string =>
  s.toLowerCase().replace(/[0-9]+/g, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
