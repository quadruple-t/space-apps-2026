/**
 * True when a key press belongs to the control that has focus instead of the 3D view: text boxes,
 * dropdowns, a slider's arrow keys, and anything marked `data-no-flight-controls` (dialogs).
 * Buttons and links do not count, so walking keeps working after you click a panel button.
 */
export function keyBelongsToControl(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[data-no-flight-controls]")) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName === "INPUT") {
    const type = (target as HTMLInputElement).type;
    if (type === "range") return key.toLowerCase().startsWith("arrow");
    return !["button", "checkbox", "radio", "submit", "reset"].includes(type);
  }
  return false;
}
