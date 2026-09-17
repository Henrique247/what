import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const PERMISSIONS = {
    BOT_CONFIG_UPDATE: 'BOT_CONFIG_UPDATE',
    MEMORY_MANAGE: 'MEMORY_MANAGE',
    GROUP_MANAGE: 'GROUP_MANAGE',
    KNOWLEDGE_MANAGE: 'KNOWLEDGE_MANAGE',
    WHATSAPP_MANAGE: 'WHATSAPP_MANAGE',
    USER_MANAGE: 'USER_MANAGE',
    BOT_DELETE: 'BOT_DELETE'
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export function generateSecureToken(): string {
    return crypto.randomBytes(24).toString('hex');
}

export type JidType = 'PRIVATE_PN' | 'LID' | 'GROUP' | 'NEWSLETTER' | 'BROADCAST' | 'UNKNOWN';

/**
 * Deterministically classifies a WhatsApp JID or identifier into its canonical type.
 */
export function classifyJid(rawJid: string | null | undefined): JidType {
    if (!rawJid) return 'UNKNOWN';
    const jid = String(rawJid).trim().toLowerCase();
    if (jid.endsWith('@g.us')) return 'GROUP';
    if (jid.endsWith('@lid')) return 'LID';
    if (jid.endsWith('@newsletter')) return 'NEWSLETTER';
    if (jid.endsWith('@broadcast') || jid === 'status@broadcast') return 'BROADCAST';
    if (jid.endsWith('@s.whatsapp.net')) return 'PRIVATE_PN';
    // If it's pure digits with 8-16 digits, it's a Phone/PN identifier
    if (/^\+?\d{8,16}$/.test(jid)) return 'PRIVATE_PN';
    // If it's a numeric LID without domain (typically 14-16 digits starting with specific range),
    // but in Baileys LIDs always end with @lid. If no domain and length > 16, unknown.
    return 'UNKNOWN';
}

/**
 * Normalizes a phone number or PN JID into numeric digits.
 * CRITICAL: NEVER applies to @lid identifiers or transforms @lid into a phone number.
 */
export function normalizePhone(rawPhone: string | null | undefined): string {
    if (!rawPhone) return '';
    const trimmed = String(rawPhone).trim();
    // Do NOT normalize LIDs as phone numbers
    if (classifyJid(trimmed) === 'LID' || trimmed.toLowerCase().endsWith('@lid')) {
        return '';
    }
    // Strip domain suffix (e.g. @s.whatsapp.net)
    const withoutSuffix = trimmed.split('@')[0];
    return withoutSuffix.replace(/\D/g, '');
}

/**
 * Normalizes a LID identifier into canonical 'user@lid' format.
 */
export function normalizeLid(rawLid: string | null | undefined): string {
    if (!rawLid) return '';
    const trimmed = String(rawLid).trim().toLowerCase();
    if (trimmed.endsWith('@lid')) {
        return trimmed;
    }
    if (/^\d{10,20}$/.test(trimmed)) {
        return `${trimmed}@lid`;
    }
    return '';
}

export interface OwnerIdentity {
    phone?: string;       // e.g. "244942272074"
    pn?: string;          // e.g. "244942272074@s.whatsapp.net"
    lid?: string;         // e.g. "29596971991096@lid"
    jid?: string;         // e.g. "244942272074@s.whatsapp.net"
    name?: string;
}

/**
 * Resolves the canonical OwnerIdentity from bot configuration.
 */
export function resolveOwnerIdentity(currentBot: any): OwnerIdentity {
    const rawOwner = String(currentBot?.ownerPhone || currentBot?.ownerNumber || currentBot?.ownerJid || '').trim();
    const rawOwnerLid = String(currentBot?.ownerLid || '').trim();
    const rawOwnerJid = String(currentBot?.ownerJid || '').trim();
    const rawOwnerName = String(currentBot?.ownerName || '').trim();

    let lid = normalizeLid(rawOwnerLid);
    // If rawOwner is itself a LID
    if (!lid && rawOwner.endsWith('@lid')) {
        lid = normalizeLid(rawOwner);
    }

    const phone = normalizePhone(rawOwner);
    const pn = phone ? `${phone}@s.whatsapp.net` : (rawOwnerJid.endsWith('@s.whatsapp.net') ? rawOwnerJid : undefined);

    return {
        phone: phone || undefined,
        pn: pn || undefined,
        lid: lid || undefined,
        jid: rawOwnerJid || pn || undefined,
        name: rawOwnerName || undefined
    };
}

/**
 * Verifies if two phone numbers match, even with or without country code prefix.
 */
export function isPhoneMatch(p1: string | null | undefined, p2: string | null | undefined): boolean {
    const clean1 = normalizePhone(p1);
    const clean2 = normalizePhone(p2);
    if (!clean1 || !clean2) return false;
    if (clean1 === clean2) return true;
    
    // Check if one ends with the other (at least 8 digits matching to avoid false positives)
    if (clean1.length >= 8 && clean2.length >= 8) {
        if (clean1.endsWith(clean2) || clean2.endsWith(clean1)) {
            return true;
        }
    }
    return false;
}

export function hasPermission(bot: any, permission: string): boolean {
    if (!bot) return false;
    const perms: string[] = Array.isArray(bot.ownerPermissions) ? bot.ownerPermissions : ALL_PERMISSIONS;
    return perms.includes(permission) || perms.includes('ALL');
}

/**
 * Sanitizes bot configuration to ensure secrets (Gemini keys, internal tokens)
 * are NEVER returned to the client frontend.
 */
export function sanitizeBotForClient(bot: any, status?: string, qr?: string | null) {
    if (!bot) return null;
    const { geminiKeys, ...safeBot } = bot;
    return {
        ...safeBot,
        hasGeminiKeys: !!geminiKeys && geminiKeys.trim().length > 0,
        geminiKeysConfigured: !!geminiKeys && geminiKeys.trim().length > 0,
        status: status || "Desconectado",
        qr: qr || null
    };
}

// In-Memory Rate Limiting
interface RateLimitRecord {
    count: number;
    resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

export function rateLimiter(limitCount: number = 100, windowMs: number = 60000) {
    return (req: Request, res: Response, next: NextFunction) => {
        const key = req.ip || req.socket.remoteAddress || 'anonymous';
        const now = Date.now();
        const record = rateLimitMap.get(key);

        if (!record || now > record.resetTime) {
            rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }

        record.count++;
        if (record.count > limitCount) {
            res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
            return res.status(429).json({
                error: 'Muitas requisições. Por favor, aguarde alguns segundos antes de tentar novamente.'
            });
        }

        next();
    };
}

export function hashSecret(secret: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(secret, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

export function verifySecret(secret: string, storedHash: string): boolean {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt, originalHash] = storedHash.split(':');
    try {
        const hash = crypto.scryptSync(secret, salt, 64).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
    } catch {
        return false;
    }
}

