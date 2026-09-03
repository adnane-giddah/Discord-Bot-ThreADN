/**
 * Serializes work per key (channel id) so that two bulk operations targeting
 * the same channel never run concurrently — this keeps duplicate-detection
 * (which reads live Discord state at plan time) race-free.
 */
export class OperationQueue {
  private tails = new Map<string, Promise<unknown>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    // Swallow rejection for chaining purposes only; the caller still gets the real result/error via `run`.
    this.tails.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  }
}
