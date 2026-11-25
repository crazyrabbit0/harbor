// Runs synchronously like an inline try would; a sync throw becomes a rejection.
export function attempt<T>(run: () => Promise<T>): Promise<T> {
  try {
    return run();
  } catch (error) {
    return Promise.reject(error);
  }
}
