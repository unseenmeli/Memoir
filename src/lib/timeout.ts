/**
 * Ceiling on a network-bound operation. Neither Supabase's fetch calls nor its
 * storage uploads carry a timeout of their own, so a request that stalls on a
 * dead connection shows up as a Save button spinning indefinitely with nothing
 * to explain it. Better to surface a real error the user can act on.
 *
 * Takes a `PromiseLike` rather than a `Promise` because Postgrest's query
 * builders are thenables, not promises — `supabase.from(…).select()` can be
 * passed straight in.
 */
export const SAVE_TIMEOUT_MS = 20000;

export function withTimeout<T>(
  work: PromiseLike<T>,
  label: string,
  ms: number = SAVE_TIMEOUT_MS,
): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out. Check your connection and try again.`,
            ),
          ),
        ms,
      ),
    ),
  ]);
}
