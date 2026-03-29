export interface SessionRegistryEntry {
    pid: string;
    name: string;
}

export interface ResolveGuestAssignmentParams<TConnection> {
    requestedSessionToken: string;
    tabToken: string;
    currentConnection: TConnection;
    sessionRegistry: Map<string, SessionRegistryEntry>;
    connections: Map<string, TConnection>;
    numPlayers: number;
    gameStarted: boolean;
    createSessionToken: () => string;
}

export interface ResolveGuestAssignmentResult<TConnection> {
    pid: string | null;
    sessionToken: string;
    tabToken: string;
    replacedConnection: TConnection | null;
}

const GUEST_SESSION_STORAGE_KEY = 'ne-guest-session-token';

export function normalizeSessionToken(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export function getGuestSessionStorageKey(roomId: string): string {
    const normalizedRoomId = String(roomId).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    return `${GUEST_SESSION_STORAGE_KEY}:${normalizedRoomId}`;
}

export function loadOrCreateGuestSessionTokenForRoom(
    roomId: string,
    createSessionToken: () => string,
    storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): string {
    const key = getGuestSessionStorageKey(roomId);
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = createSessionToken();
    storage.setItem(key, created);
    return created;
}

export function persistGuestSessionTokenForRoom(
    roomId: string,
    sessionToken: string,
    storage: Pick<Storage, 'setItem'> = localStorage,
): void {
    storage.setItem(getGuestSessionStorageKey(roomId), sessionToken);
}

export function getAvailableGuestPid<TConnection>(
    connections: Map<string, TConnection>,
    numPlayers: number,
    reservedPids: Set<string> = new Set(),
): string | null {
    for (let i = 1; i < numPlayers; i++) {
        const pid = String(i);
        if (!connections.has(pid) && !reservedPids.has(pid)) return pid;
    }
    return null;
}

export function resolveGuestAssignment<TConnection>({
    requestedSessionToken,
    tabToken,
    currentConnection,
    sessionRegistry,
    connections,
    numPlayers,
    gameStarted,
    createSessionToken,
}: ResolveGuestAssignmentParams<TConnection>): ResolveGuestAssignmentResult<TConnection> {
    const normalizedSessionToken = normalizeSessionToken(requestedSessionToken) || createSessionToken();
    const normalizedTabToken = normalizeSessionToken(tabToken) || createSessionToken();
    const knownInfo = sessionRegistry.get(normalizedSessionToken) ?? null;
    let pid = knownInfo?.pid ?? null;
    let replacedConnection: TConnection | null = null;

    if (pid) {
        const existingConnection = connections.get(pid);
        if (existingConnection && existingConnection !== currentConnection) {
            replacedConnection = existingConnection;
        }
    } else {
        const reservedPids = gameStarted
            ? new Set(Array.from(sessionRegistry.values()).map(info => info.pid))
            : new Set<string>();
        pid = getAvailableGuestPid(connections, numPlayers, reservedPids);
    }

    return {
        pid,
        sessionToken: normalizedSessionToken,
        tabToken: normalizedTabToken,
        replacedConnection,
    };
}
