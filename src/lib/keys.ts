/**
 * True when a key press is meant for a text field, a control or an open dialog, not for the page's
 * shortcuts (like space to play).
 */
export function isTyping(target: EventTarget | null): boolean {
  if (document.querySelector("[aria-modal=true]")) return true;
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return (
    el.closest("input, select, textarea, button, [role=slider], [contenteditable=true]") !== null
  );
}
