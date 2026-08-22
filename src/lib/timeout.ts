/**
 * Ceiling on a network-bound operation. Instant queues writes while the socket
 * is down and the promise simply never settles, which showed up as a Save
 * button spinning indefinitely with nothing to explain it. Better to surface a
 * real error the user can act on than to spin forever.
 */
export const SAVE_TIMEOUT_MS = 20000;

export function withTimeout<T>(
  work: Promise<T>,
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
