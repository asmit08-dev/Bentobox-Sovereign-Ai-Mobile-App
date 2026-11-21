// The web preview's dialogs. React Native Web's Alert does nothing, so the browser's own
// confirm and alert boxes are used. Phones use dialog.ts.
import type { ConfirmOptions } from './dialog';

export type { ConfirmOptions };

/** Asks before doing something. Resolves true when the person confirms. */
export function confirmAction({ title, message }: ConfirmOptions) {
  return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
}

/** Tells the person that something didn't work. */
export function showProblem(title: string, message: string) {
  window.alert(`${title}\n\n${message}`);
}
