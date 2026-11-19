const DAY = 24 * 60 * 60 * 1000;

export type HistorySection = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

export const HISTORY_SECTIONS: HistorySection[] = [
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Older',
];

/** Which history group a chat belongs to, from when it was last used. */
export function historySection(timestamp: number, now = new Date()): HistorySection {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp >= startOfToday) return 'Today';
  if (timestamp >= startOfToday - DAY) return 'Yesterday';
  if (timestamp >= startOfToday - 7 * DAY) return 'Previous 7 days';
  return 'Older';
}

/**
 * A short "when" for a list row: the time for today and yesterday ("9:41 PM"),
 * the weekday for the last week ("Mon"), and the date before that ("12 Nov").
 */
export function shortWhen(timestamp: number, now = new Date()) {
  const section = historySection(timestamp, now);
  if (section === 'Today' || section === 'Yesterday') return format('time', timestamp);
  if (section === 'Previous 7 days') return format('weekday', timestamp);
  return format('date', timestamp);
}

const FORMATS = {
  time: { hour: 'numeric', minute: '2-digit' },
  weekday: { weekday: 'short' },
  date: { day: 'numeric', month: 'short' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

// Building a formatter is slow on phones, and a list asks for one per row.
// Each kind is built once, the first time it is needed, and then reused.
const formatters: Partial<Record<keyof typeof FORMATS, Intl.DateTimeFormat>> = {};

function format(kind: keyof typeof FORMATS, timestamp: number) {
  const formatter = (formatters[kind] ??= new Intl.DateTimeFormat(undefined, FORMATS[kind]));
  return formatter.format(timestamp);
}
