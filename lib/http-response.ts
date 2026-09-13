export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const status = response.status ? ` (HTTP ${response.status})` : "";
    throw new Error(`${fallbackMessage}${status}.`);
  }
}
