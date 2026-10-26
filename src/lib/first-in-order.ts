/** First non-null result in array order: a later task wins only when every earlier one gave null or failed. */
export async function firstInOrder<T>(tasks: readonly Promise<T | null>[]): Promise<T | null> {
  const settled = tasks.map((task) => task.catch(() => null));
  for (const task of settled) {
    const value = await task;
    if (value != null) return value;
  }
  return null;
}
