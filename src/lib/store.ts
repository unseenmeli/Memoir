import { useSyncExternalStore } from "react";

/**
 * A very small live-query primitive.
 *
 * Instant was a sync engine: `db.useQuery` was a subscription, screens updated
 * on their own, and writes appeared locally before they reached the server.
 * Supabase is a database with a realtime feed bolted alongside it, so that
 * behaviour has to be reassembled — which is all this file is.
 *
 * A `Query` owns one fetch and the set of components watching it, so five
 * screens asking for "my pins" share a single request and a single result
 * rather than each running their own. It refetches when told to: either by a
 * realtime event, or by a mutation that just changed the thing (see
 * `src/lib/data.ts`). Deliberately not a general-purpose cache — there are
 * exactly two queries in this app and both are scoped to one signed-in user.
 */
export type QueryState<T> = {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
};

export class Query<T> {
  /**
   * Replaced wholesale on every change, never mutated: `useSyncExternalStore`
   * compares snapshots by identity, so a mutated object would never re-render
   * and a freshly built one every call would re-render forever.
   */
  private state: QueryState<T> = { data: null, isLoading: true, error: null };
  private listeners = new Set<() => void>();
  private started = false;
  private inFlight: Promise<void> | null = null;
  private again = false;

  constructor(private readonly fetcher: () => Promise<T>) {}

  getSnapshot = (): QueryState<T> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    // The first component to watch is what starts the query — nothing fetches
    // until something is actually on screen to show it.
    if (!this.started) void this.refetch();
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Fetches now. Concurrent calls collapse onto the in-flight request, and a
   * call that arrives *during* one queues exactly one more run — so a burst of
   * realtime events becomes two requests, not twelve, and the last one still
   * sees the final state.
   */
  refetch = (): Promise<void> => {
    this.started = true;
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }

    const run = (async () => {
      try {
        const data = await this.fetcher();
        this.emit({ data, isLoading: false, error: null });
      } catch (error) {
        // Keep whatever is already on screen. A dropped connection mid-scroll
        // should surface as an error, not blank the list out.
        this.emit({
          data: this.state.data,
          isLoading: false,
          error: error as Error,
        });
      } finally {
        this.inFlight = null;
        if (this.again) {
          this.again = false;
          void this.refetch();
        }
      }
    })();

    this.inFlight = run;
    return run;
  };

  /** Refetch, but only if anyone has ever asked for this data. */
  invalidate = (): void => {
    if (!this.started) return;
    void this.refetch();
  };

  /** Back to square one — used when the signed-in user goes away. */
  reset = (): void => {
    this.started = false;
    this.again = false;
    this.emit({ data: null, isLoading: true, error: null });
  };

  private emit(next: QueryState<T>): void {
    this.state = next;
    // Copied first: a listener that unsubscribes while being notified would
    // otherwise mutate the set mid-iteration.
    for (const listener of [...this.listeners]) listener();
  }
}

export function useQuery<T>(query: Query<T>): QueryState<T> {
  return useSyncExternalStore(
    query.subscribe,
    query.getSnapshot,
    query.getSnapshot,
  );
}
