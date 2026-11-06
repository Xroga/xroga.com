/** Retry one transient asset failure without resubmitting the user's prompt.
 * React caches rejected lazy imports, so retry inside the import promise. */
export async function loadPresentation<T>(load: () => Promise<T>): Promise<T> {
  try { return await load(); }
  catch (error) {
    if (!(error instanceof Error) || !/ChunkLoadError|Loading chunk \S+ failed|Failed to fetch dynamically imported module/.test(`${error.name}: ${error.message}`)) throw error;
    return load();
  }
}
