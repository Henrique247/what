import { GoogleGenAI } from '@google/genai';
import { Firestore } from 'firebase/firestore';
import { recordAuditLog } from '../audit';

/**
 * Centralized Gemini Configuration
 * Validated against current @google/genai SDK specifications.
 * Primary model: gemini-3.8-flash
 * Fallback models: gemini-flash-latest, gemini-3.1-flash-lite
 */
export const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

export const GEMINI_FALLBACK_MODELS: string[] = Array.from(new Set([
    GEMINI_DEFAULT_MODEL,
    'gemini-flash-latest',
    'gemini-3.1-flash-lite'
]));

export const geminiConfig = {
    defaultModel: GEMINI_DEFAULT_MODEL,
    fallbackModels: GEMINI_FALLBACK_MODELS,
    provider: 'GoogleGenAI',
    apiVersion: 'v1beta',
    maxRetries: 3,
    initialBackoffMs: 1000
};

export function getGeminiModel(): string {
    return GEMINI_DEFAULT_MODEL;
}

/**
 * Safely masks API keys for diagnostics and audit logging.
 * Never outputs the full API key (e.g. AIzaSy...)
 */
export function maskApiKey(key: string | null | undefined): string {
    if (!key) return '[NO_KEY]';
    const clean = key.trim();
    if (clean.length <= 8) return '****';
    return `${clean.substring(0, 4)}...${clean.substring(clean.length - 4)}`;
}

/**
 * Sanitizes any raw key occurrences from an error message.
 */
export function sanitizeErrorMessage(message: string | null | undefined): string {
    if (!message) return '';
    return message.replace(/AIza[0-9A-Za-z-_]{20,}/g, '[REDACTED_API_KEY]');
}

// In-memory key indexes per bot for round-robin rotation
const botKeyIndexMap = new Map<string, number>();

export interface GeminiGenerateOptions {
    botId: string;
    geminiKeysStr?: string;
    keys?: string[];
    history?: any[];
    prompt?: string;
    userParts?: any[];
    systemInstruction?: string;
    responseMimeType?: string;
    firestoreDb?: Firestore;
}

export interface GeminiGenerateResult {
    success: boolean;
    text: string | null;
    usedModel: string;
    usedKeyMasked: string;
    attempts: number;
    error?: string;
}

/**
 * Executes a Gemini generation request with:
 * 1. Round-robin multi-key rotation and key isolation.
 * 2. Automatic 404 model-not-found recovery using supported fallbacks.
 * 3. Exponential backoff for 503 high-demand / temporary errors.
 * 4. Immediate key rotation on 429 quota exhaustion.
 * 5. Complete isolation preventing WhatsApp crashes.
 */
export async function generateGeminiContent(options: GeminiGenerateOptions): Promise<GeminiGenerateResult> {
    const {
        botId,
        geminiKeysStr,
        keys: directKeys,
        history = [],
        prompt,
        userParts,
        systemInstruction,
        responseMimeType,
        firestoreDb
    } = options;

    // Collect available API keys
    let rawKeys: string[] = directKeys || [];
    if (rawKeys.length === 0 && geminiKeysStr) {
        rawKeys = geminiKeysStr.split(',').map(k => k.trim().replace(/["']/g, '')).filter(Boolean);
    }
    if (rawKeys.length === 0 && process.env.GEMINI_API_KEY) {
        rawKeys = process.env.GEMINI_API_KEY.split(',').map(k => k.trim().replace(/["']/g, '')).filter(Boolean);
    }

    if (rawKeys.length === 0) {
        return {
            success: false,
            text: null,
            usedModel: GEMINI_DEFAULT_MODEL,
            usedKeyMasked: '[NONE]',
            attempts: 0,
            error: 'Nenhuma chave de API Gemini configurada'
        };
    }

    let keyIndex = botKeyIndexMap.get(botId) || 0;
    let modelIndex = 0;
    let attempts = 0;
    const maxTotalAttempts = Math.min(rawKeys.length * 2, 6);
    let lastError: any = null;

    // Prepare contents
    let contentsPayload: any[] = [];
    if (history.length > 0) {
        contentsPayload = [...history];
    }
    if (userParts && userParts.length > 0) {
        contentsPayload.push({ role: 'user', parts: userParts });
    } else if (prompt) {
        contentsPayload.push({ role: 'user', parts: [{ text: prompt }] });
    }

    while (attempts < maxTotalAttempts && modelIndex < GEMINI_FALLBACK_MODELS.length) {
        attempts++;
        const currentKey = rawKeys[keyIndex % rawKeys.length];
        const maskedKey = maskApiKey(currentKey);
        const currentModel = GEMINI_FALLBACK_MODELS[modelIndex];
        const requestStartTime = Date.now();

        try {
            console.log(`[GEMINI_REQUEST] Bot: ${botId} | Modelo: ${currentModel} | Chave: ${maskedKey} | Tentativa: ${attempts}/${maxTotalAttempts}`);

            const ai = new GoogleGenAI({
                apiKey: currentKey,
                httpOptions: {
                    headers: {
                        'User-Agent': 'aistudio-build'
                    }
                }
            });

            const genConfig: any = {};
            if (systemInstruction) {
                genConfig.systemInstruction = systemInstruction;
            }
            if (responseMimeType) {
                genConfig.responseMimeType = responseMimeType;
            }

            const response = await ai.models.generateContent({
                model: currentModel,
                contents: contentsPayload.length === 1 && typeof contentsPayload[0]?.parts?.[0]?.text === 'string' && !history.length
                    ? contentsPayload[0].parts[0].text
                    : contentsPayload,
                config: Object.keys(genConfig).length > 0 ? genConfig : undefined
            });

            const outputText = response.text || null;
            const durationMs = Date.now() - requestStartTime;

            console.log(`[GEMINI_RESPONSE_SUCCESS] Bot: ${botId} | Modelo: ${currentModel} | Duração: ${durationMs}ms | Chave: ${maskedKey}`);

            if (firestoreDb) {
                recordAuditLog(firestoreDb, {
                    botId,
                    action: 'GEMINI_RESPONSE_SUCCESS',
                    result: 'SUCCESS',
                    duration: durationMs,
                    details: `Resposta gerada com sucesso pelo modelo ${currentModel} em ${durationMs}ms (chave: ${maskedKey})`
                }).catch(() => {});
            }

            // Update key index for next round
            botKeyIndexMap.set(botId, (keyIndex + 1) % rawKeys.length);

            return {
                success: true,
                text: outputText,
                usedModel: currentModel,
                usedKeyMasked: maskedKey,
                attempts
            };

        } catch (err: any) {
            lastError = err;
            const durationMs = Date.now() - requestStartTime;
            const errMsg = sanitizeErrorMessage(err?.message || String(err));
            const is404 = errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('NOT_FOUND') || err?.status === 404;
            const is503 = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE') || errMsg.includes('unavailable') || err?.status === 503;
            const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED') || err?.status === 429;

            // 1. TRATAMENTO DE ERRO 404 DE MODELO
            if (is404) {
                console.error('[GEMINI_MODEL_NOT_FOUND]', {
                    botId,
                    model: currentModel,
                    provider: geminiConfig.provider,
                    apiVersion: geminiConfig.apiVersion,
                    errorCode: 404,
                    errorName: err?.name || 'ModelNotFoundError',
                    errorMessage: errMsg,
                    durationMs,
                    timestamp: new Date().toISOString()
                });

                if (firestoreDb) {
                    recordAuditLog(firestoreDb, {
                        botId,
                        action: 'GEMINI_MODEL_NOT_FOUND',
                        result: 'ERROR',
                        duration: durationMs,
                        details: `Modelo ${currentModel} não encontrado no v1beta. Tentando fallback para próximo modelo.`
                    }).catch(() => {});
                }

                // Advance to next supported fallback model
                modelIndex++;
                continue;
            }

            // 2. TRATAMENTO DE ERRO 503 (ALTA DEMANDA / TEMPORÁRIO)
            if (is503) {
                const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 4000);
                console.warn(`[GEMINI_503_HIGH_DEMAND] Bot ${botId} - Modelo ${currentModel} sobrecarregado. Backoff de ${backoffMs}ms (Tentativa ${attempts}/${maxTotalAttempts})`);
                
                if (firestoreDb) {
                    recordAuditLog(firestoreDb, {
                        botId,
                        action: 'GEMINI_503_HIGH_DEMAND',
                        result: 'ERROR',
                        duration: durationMs,
                        details: `Modelo ${currentModel} temporariamente indisponível (503). Aplicando backoff de ${backoffMs}ms.`
                    }).catch(() => {});
                }

                await new Promise(resolve => setTimeout(resolve, backoffMs));
                // Try next key if available
                if (rawKeys.length > 1) {
                    keyIndex++;
                }
                continue;
            }

            // 3. TRATAMENTO DE ERRO 429 (QUOTA EXAURIDA)
            if (is429) {
                console.warn(`[GEMINI_429_QUOTA] Bot ${botId} - Chave ${maskedKey} atingiu limite de quota. Rotacionando para próxima chave.`);
                
                if (firestoreDb) {
                    recordAuditLog(firestoreDb, {
                        botId,
                        action: 'GEMINI_429_QUOTA',
                        result: 'ERROR',
                        duration: durationMs,
                        details: `Chave ${maskedKey} atingiu limite de quota (429). Rotacionando para próxima chave configurada.`
                    }).catch(() => {});
                }

                keyIndex++;
                continue;
            }

            // Other errors: try next key once or next model
            console.error(`[GEMINI_API_ERROR] Bot ${botId} - Erro na chamada Gemini:`, errMsg);
            if (firestoreDb) {
                recordAuditLog(firestoreDb, {
                    botId,
                    action: 'GEMINI_KEY_FAILED',
                    result: 'ERROR',
                    duration: durationMs,
                    details: `Chave ${maskedKey} falhou: ${errMsg}`
                }).catch(() => {});
            }
            keyIndex++;
        }
    }

    const finalErrMsg = sanitizeErrorMessage(lastError?.message || 'Falha ao processar com modelo Gemini');

    if (firestoreDb) {
        recordAuditLog(firestoreDb, {
            botId,
            action: 'GEMINI_ALL_ATTEMPTS_FAILED',
            result: 'ERROR',
            details: `Falha após ${attempts} tentativas com todas as chaves e modelos: ${finalErrMsg}`
        }).catch(() => {});
    }

    return {
        success: false,
        text: null,
        usedModel: GEMINI_FALLBACK_MODELS[Math.min(modelIndex, GEMINI_FALLBACK_MODELS.length - 1)],
        usedKeyMasked: maskApiKey(rawKeys[keyIndex % rawKeys.length]),
        attempts,
        error: finalErrMsg
    };
}
