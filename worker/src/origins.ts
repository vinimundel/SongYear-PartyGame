export function originMatchesAllowed(origin: string, configured: string[]): boolean {
  return configured.some((allowed) => {
    if (allowed === origin) return true;
    const wildcard = allowed.match(/^(https?):\/\/\*\.([^/:]+)$/i);
    if (!wildcard) return false;
    try {
      const candidate = new URL(origin);
      return candidate.protocol === `${wildcard[1].toLowerCase()}:` &&
        candidate.port === "" &&
        candidate.hostname.toLowerCase().endsWith(`.${wildcard[2].toLowerCase()}`);
    } catch {
      return false;
    }
  });
}
