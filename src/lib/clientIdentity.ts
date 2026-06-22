export function normalizeClientName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function dedupeClientsByName<T extends { name: string }>(clients: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const client of clients) {
    const key = normalizeClientName(client.name);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(client);
  }

  return deduped;
}
