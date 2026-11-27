// Page loader (Decision Log #581): code-only.
// Counts the API requests that are in flight, so the route progress bar can
// tell whether a navigation is still waiting on data. It only watches
// window.fetch: the caller gets the very same promise back, so the request,
// the response, errors and timing are untouched.

type Listener = () => void;

const active = new Set<number>();
const listeners = new Set<Listener>();
let nextId = 0;
let originalFetch: typeof window.fetch | null = null;

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Id the next request will get. Pass it to getInFlight() to count only later requests. */
export function getMark(): number {
  return nextId;
}

/** Requests in flight; with `since`, only those that started at or after that mark. */
export function getInFlight(since = 0): number {
  let count = 0;
  active.forEach((id) => {
    if (id >= since) count += 1;
  });
  return count;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Wraps window.fetch once. Install after installSilentRefresh(), so each outer call counts once. */
export function installFetchActivity(): void {
  if (originalFetch) return;
  const inner = window.fetch;
  originalFetch = inner;
  window.fetch = (...args: Parameters<typeof window.fetch>) => {
    const id = nextId++;
    active.add(id);
    notify();
    const done = () => {
      active.delete(id);
      notify();
    };
    let request: Promise<Response>;
    try {
      request = inner.apply(window, args);
    } catch (err) {
      done();
      throw err;
    }
    void Promise.resolve(request).then(done, done);
    return request;
  };
}

export function __resetFetchActivityForTests(): void {
  if (originalFetch) window.fetch = originalFetch;
  originalFetch = null;
  active.clear();
  listeners.clear();
  nextId = 0;
}
