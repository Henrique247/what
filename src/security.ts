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

/**
 * Normalizes any phone number or WhatsApp JID into pure digits.
 * E.g., "+244 942-272-074" -> "244942272074"
 * E.g., "244942272074@s.whatsapp.net" -> "244942272074"
 */
export function normalizePhone(rawPhone: string | null | undefined): string {
    if (!rawPhone) return '';
    // Strip JID suffix if present
    const withoutSuffix = rawPhone.split('@')[0];
    // Keep only numeric digits
    return withoutSuffix.replace(/\D/g, '');
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

