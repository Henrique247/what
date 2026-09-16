import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, Firestore } from 'firebase/firestore';

export interface AuditLogEntry {
    botId: string;
    userId?: string;
    actorId?: string;
    phone?: string;
    actorPhone?: string;
    role?: 'OWNER' | 'ADMIN' | 'USER';
    actorRole?: 'OWNER' | 'ADMIN' | 'USER';
    action: string;
    command?: string;
    result: 'SUCCESS' | 'DENIED' | 'ERROR';
    details?: string;
}

/**
 * Sanitizes strings to strictly prevent logging API keys or secret tokens.
 */
function sanitizeDetails(str?: string): string {
    if (!str) return '';
    return str
        .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
        .replace(/([a-f0-9]{48})/g, '[REDACTED_TOKEN]')
        .substring(0, 500);
}

export async function recordAuditLog(firestoreDb: Firestore, entry: AuditLogEntry) {
    try {
        const auditCol = collection(firestoreDb, 'bots', entry.botId, 'audit_logs');
        const role = entry.actorRole || entry.role || 'USER';
        const phone = (entry.actorPhone || entry.phone || '').replace(/\D/g, '');
        const actorId = entry.actorId || entry.userId || phone || 'system';

        await addDoc(auditCol, {
            botId: entry.botId,
            userId: actorId,
            actorId: actorId,
            phone: phone,
            actorPhone: phone,
            role: role,
            actorRole: role,
            action: entry.action,
            command: entry.command ? entry.command.substring(0, 200) : '',
            result: entry.result,
            details: sanitizeDetails(entry.details),
            timestamp: serverTimestamp()
        });
        console.log(`[AuditLog] [${entry.botId}] ${role} (${phone || 'web'}): ${entry.action} -> ${entry.result}`);
    } catch (err) {
        console.error(`[AuditLog] Falha ao registrar log para bot ${entry.botId}:`, err);
    }
}

export async function fetchAuditLogs(firestoreDb: Firestore, botId: string, maxCount: number = 30): Promise<any[]> {
    try {
        const auditCol = collection(firestoreDb, 'bots', botId, 'audit_logs');
        const q = query(auditCol, orderBy('timestamp', 'desc'), limit(maxCount));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date().toISOString()
            } as any;
        });
    } catch (err) {
        console.error(`[AuditLog] Falha ao buscar logs para bot ${botId}:`, err);
        return [];
    }
}
