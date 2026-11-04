/** Keep display names plain and nonempty after removing control characters. */
export function normalizeDisplayName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').trim();
}
export function normalizeMessage(value: string) {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '').trim();
}
