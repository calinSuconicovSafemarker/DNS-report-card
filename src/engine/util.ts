/** The verdict of every Couldn't check result whose service gave no usable answer. */
export const COULDNT_CHECK_VERDICT = 'Couldn’t check — no response from the service';

/** The items without duplicates, in first-seen order. */
export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** `1 day`, `2 days`. */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
