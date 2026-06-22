export function normalizeClientName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function dedupeClientsByName<
  T extends { name: string; clientCode?: string | null; normalizedName?: string | null; organizationId?: string | null }
>(clients: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const client of clients) {
    const codeKey = (client.clientCode || "").trim().toUpperCase();
    const normalized = client.normalizedName ? normalizeClientName(client.normalizedName) : normalizeClientName(client.name);
    const orgKey = client.organizationId || "global";
    const scopedKey = codeKey ? `code::${orgKey}::${codeKey}` : `legacy::${orgKey}::${normalized}`;

    if (seen.has(scopedKey)) continue;
    seen.add(scopedKey);
    deduped.push(client);
  }

  return deduped;
}
