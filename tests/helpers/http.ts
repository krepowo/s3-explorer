/**
 * SeaweedFS serves the anonymous read path with a short lag, so a public URL
 * that was just written can 404 for a moment. Poll instead of assuming the
 * object is instantly visible.
 */
export async function fetchEventually(
  url: string,
  expected = 200,
  timeoutMs = 5000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let status = 0;
  while (Date.now() < deadline) {
    status = (await fetch(url)).status;
    if (status === expected) return status;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return status;
}
