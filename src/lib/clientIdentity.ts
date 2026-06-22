export function normalizeClientName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function dedupeClientsByName<
  T extends { name: string; normalizedName?: string | null; organizationId?: string | null }
>(clients: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const client of clients) {
    const normalized = client.normalizedName ? normalizeClientName(client.normalizedName) : normalizeClientName(client.name);
    const scopedKey = client.organizationId ? `${client.organizationId}::${normalized}` : normalized;

    if (seen.has(scopedKey)) continue;
    seen.add(scopedKey);
    deduped.push(client);
  }

  return deduped;
}
