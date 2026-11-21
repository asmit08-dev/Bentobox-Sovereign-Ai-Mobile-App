/** 2457600 → "2.3 MB", 120000 → "117 KB", 900 → "900 B". */
export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Report.pdf" → "PDF", "notes.md" → "MD". */
export function fileTypeLabel(name: string) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? 'FILE' : name.slice(dot + 1).toUpperCase();
}

/** A PDF's line under its name: "PDF · 3 pages", or "PDF · 80 pages · first 50 sent". */
export function pdfDetails(pageCount: number | undefined, sentPages: number) {
  if (!pageCount) return 'PDF';
  const pages = `PDF · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
  return sentPages > 0 && sentPages < pageCount ? `${pages} · first ${sentPages} sent` : pages;
}
