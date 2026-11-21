// The web preview's menu. React Native Web has no action sheet and its Alert does nothing,
// so the browser's prompt lists the choices by number. Phones use menu.ts.
import type { MenuOption } from './menu';

export type { MenuOption };

export function showMenu(options: MenuOption[], title?: string) {
  const lines = options.map((option, index) => `${index + 1}. ${option.label}`);
  const answer = window.prompt([title, ...lines, 'Type a number:'].filter(Boolean).join('\n'));
  options[Number(answer) - 1]?.onPress();
}
