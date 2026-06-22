export function normalizeClientName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getIdentityKey(client: {
  name: string;
  clientCode?: string | null;
  normalizedName?: string | null;
}) {
  const codeKey = (client.clientCode || "").trim().toUpperCase();
  if (codeKey) return `code::${codeKey}`;

  const normalized = client.normalizedName
    ? normalizeClientName(client.normalizedName)
    : normalizeClientName(client.name);
  return `legacy::${normalized}`;
}

function getStatusRank(status?: string | null) {
  if (status === "SYNCING") return 3;
  if (status === "ONLINE") return 2;
  return 1;
}

function getTimeValue(value?: Date | string | null) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function isBetterCanonical(
  candidate: { connectorStatus?: string | null; lastHeartbeat?: Date | string | null; lastSyncedAt?: Date | string | null; createdAt?: Date | string | null },
  current: { connectorStatus?: string | null; lastHeartbeat?: Date | string | null; lastSyncedAt?: Date | string | null; createdAt?: Date | string | null }
) {
  const candidateStatus = getStatusRank(candidate.connectorStatus);
  const currentStatus = getStatusRank(current.connectorStatus);
  if (candidateStatus !== currentStatus) return candidateStatus > currentStatus;

  const candidateHeartbeat = getTimeValue(candidate.lastHeartbeat);
  const currentHeartbeat = getTimeValue(current.lastHeartbeat);
  if (candidateHeartbeat !== currentHeartbeat) return candidateHeartbeat > currentHeartbeat;

  const candidateSynced = getTimeValue(candidate.lastSyncedAt);
  const currentSynced = getTimeValue(current.lastSyncedAt);
  if (candidateSynced !== currentSynced) return candidateSynced > currentSynced;

  return getTimeValue(candidate.createdAt) > getTimeValue(current.createdAt);
}

export function dedupeClientsByName<
  T extends {
    name: string;
    clientCode?: string | null;
    normalizedName?: string | null;
    organizationId?: string | null;
    connectorStatus?: string | null;
    lastHeartbeat?: Date | string | null;
    lastSyncedAt?: Date | string | null;
    createdAt?: Date | string | null;
  }
>(clients: T[]): T[] {
  const bestByKey = new Map<string, T>();

  for (const client of clients) {
    const scopedKey = getIdentityKey(client);
    const current = bestByKey.get(scopedKey);
    if (!current || isBetterCanonical(client, current)) {
      bestByKey.set(scopedKey, client);
    }
  }

  return Array.from(bestByKey.values());
}
