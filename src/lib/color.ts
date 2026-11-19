/** Adds an alpha (0–1) to a 6-digit hex token: withAlpha('#DCCDF0', 0.5) → '#DCCDF080'. */
export function withAlpha(hex: string, alpha: number) {
  const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex.slice(0, 7)}${value.toString(16).padStart(2, '0').toUpperCase()}`;
}
