import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, Firestore, where } from 'firebase/firestore';

export interface AuditLogEntry {
    botId: string;
    userId?: string;
    actorId?: string;
    phone?: string;
    actorPhone?: string;
    role?: 'OWNER' | 'ADMIN' | 'USER' | 'SYSTEM';
    actorRole?: 'OWNER' | 'ADMIN' | 'USER' | 'SYSTEM';
    action: string;
    command?: string;
    result: 'SUCCESS' | 'DENIED' | 'ERROR' | 'SKIPPED' | 'IGNORED' | string;
    details?: string;
    errorCode?: string;
    errorName?: string;
    errorMessage?: string;
    stack?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    chatId?: string;
    groupId?: string;
    senderJid?: string;
    destinationJid?: string;
    remoteJid?: string;
    participantJid?: string;
    chatType?: string;
    messageId?: string;
    mediaType?: string;
    payloadSummary?: string;
    latencyMs?: number;
    duration?: number;
    actorJid?: string;
    fieldsChanged?: string[];
    oldValue?: any;
    newValue?: any;
}

/**
 * Sanitizes strings to strictly prevent logging API keys, PINs, passwords or secret tokens.
 */
export function sanitizeDetails(str?: string): string {
    if (!str) return '';
    return str
        .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
        .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
        .replace(/"(geminiKeys|password|accessToken|token|secret|pin|passwordHash)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"')
        .replace(/([a-f0-9]{48})/g, '[REDACTED_TOKEN]')
        .substring(0, 1000);
}

export function sanitizeValue(val: any): any {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') return sanitizeDetails(val);
    if (typeof val === 'object') {
        const copy = Array.isArray(val) ? [...val] : { ...val };
        for (const k of Object.keys(copy)) {
            if (/geminiKey|password|accessToken|token|secret|pin|key|hash/i.test(k)) {
                copy[k] = '[REDACTED]';
            } else if (typeof copy[k] === 'object') {
                copy[k] = sanitizeValue(copy[k]);
            }
        }
        return copy;
    }
    return val;
}

export async function recordAuditLog(firestoreDb: Firestore, entry: AuditLogEntry) {
    try {
        const auditCol = collection(firestoreDb, 'bots', entry.botId, 'audit_logs');
        const role = entry.actorRole || entry.role || 'USER';
        const phone = (entry.actorPhone || entry.phone || '').replace(/\D/g, '');
        const actorId = entry.actorId || entry.userId || phone || 'system';

        const docData: any = {
            botId: entry.botId,
            userId: actorId,
            actorId: actorId,
            phone: phone,
            actorPhone: phone,
            role: role,
            actorRole: role,
            action: entry.action,
            command: entry.command ? sanitizeDetails(entry.command).substring(0, 300) : '',
            result: entry.result,
            details: sanitizeDetails(entry.details),
            timestamp: serverTimestamp()
        };

        if (entry.errorCode) docData.errorCode = entry.errorCode;
        if (entry.errorName) docData.errorName = entry.errorName;
        if (entry.errorMessage) docData.errorMessage = sanitizeDetails(entry.errorMessage);
        if (entry.stack) docData.stack = sanitizeDetails(entry.stack);
        if (entry.endpoint) docData.endpoint = entry.endpoint;
        if (entry.method) docData.method = entry.method;
        if (entry.statusCode) docData.statusCode = entry.statusCode;
        if (entry.chatId) docData.chatId = entry.chatId;
        if (entry.groupId) docData.groupId = entry.groupId;
        if (entry.senderJid) docData.senderJid = entry.senderJid;
        if (entry.destinationJid) docData.destinationJid = entry.destinationJid;
        if (entry.remoteJid) docData.remoteJid = entry.remoteJid;
        if (entry.participantJid) docData.participantJid = entry.participantJid;
        if (entry.chatType) docData.chatType = entry.chatType;
        if (entry.messageId) docData.messageId = entry.messageId;
        if (entry.mediaType) docData.mediaType = entry.mediaType;
        if (entry.payloadSummary) docData.payloadSummary = entry.payloadSummary;
        if (entry.latencyMs !== undefined) docData.latencyMs = entry.latencyMs;
        if (entry.duration !== undefined) docData.duration = entry.duration;
        if (entry.actorJid) docData.actorJid = entry.actorJid;
        if (entry.fieldsChanged) docData.fieldsChanged = entry.fieldsChanged;
        if (entry.oldValue !== undefined) docData.oldValue = sanitizeValue(entry.oldValue);
        if (entry.newValue !== undefined) docData.newValue = sanitizeValue(entry.newValue);

        await addDoc(auditCol, docData);
        console.log(`[AuditLog] [${entry.botId}] ${role} (${phone || 'web'}): ${entry.action} -> ${entry.result}`);
    } catch (err) {
        console.error(`[AuditLog] Falha ao registrar log para bot ${entry.botId}:`, err);
    }
}

export async function fetchAuditLogs(
    firestoreDb: Firestore, 
    botId: string, 
    maxCount: number = 50,
    filters?: { type?: string; actor?: string; action?: string; search?: string }
): Promise<any[]> {
    try {
        const auditCol = collection(firestoreDb, 'bots', botId, 'audit_logs');
        let q = query(auditCol, orderBy('timestamp', 'desc'), limit(maxCount));
        
        const snapshot = await getDocs(q);
        let logs = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date().toISOString()
            } as any;
        });

        if (filters) {
            if (filters.type && filters.type !== 'ALL') {
                logs = logs.filter(l => l.result === filters.type);
            }
            if (filters.actor) {
                const actLower = filters.actor.toLowerCase();
                logs = logs.filter(l => 
                    (l.actorId && l.actorId.toLowerCase().includes(actLower)) ||
                    (l.actorPhone && l.actorPhone.includes(actLower)) ||
                    (l.role && l.role.toLowerCase().includes(actLower))
                );
            }
            if (filters.action) {
                const actLower = filters.action.toLowerCase();
                logs = logs.filter(l => l.action && l.action.toLowerCase().includes(actLower));
            }
            if (filters.search) {
                const sLower = filters.search.toLowerCase();
                logs = logs.filter(l => 
                    (l.action && l.action.toLowerCase().includes(sLower)) ||
                    (l.details && l.details.toLowerCase().includes(sLower)) ||
                    (l.command && l.command.toLowerCase().includes(sLower)) ||
                    (l.actorId && l.actorId.toLowerCase().includes(sLower))
                );
            }
        }

        return logs;
    } catch (err) {
        console.error(`[AuditLog] Falha ao buscar logs para bot ${botId}:`, err);
        return [];
    }
}

