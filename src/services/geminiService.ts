import { GoogleGenAI } from '@google/genai';
import { Firestore } from 'firebase/firestore';
import { recordAuditLog } from '../audit';

/**
 * Centralized Gemini Configuration
 * Validated against official @google/genai SDK specifications.
 * Primary model: gemini-3.8-flash
 * Fallback models: gemini-flash-latest, gemini-3.1-flash-lite
 */
export const GEMINI_PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

export const GEMINI_FALLBACK_MODELS: string[] = Array.from(new Set([
    GEMINI_PRIMARY_MODEL,
    'gemini-flash-latest',
    'gemini-3.1-flash-lite'
]));

export const geminiConfig = {
    primaryModel: GEMINI_PRIMARY_MODEL,
    fallbackModels: GEMINI_FALLBACK_MODELS,
    provider: 'GoogleGenAI',
    apiVersion: 'v1beta',
    maxRetries: 3,
    initialBackoffMs: 1000,
    keyCooldownMs: 60000 // 60s cooldown for keys hitting 429 quota
};

export function getGeminiModel(): string {
    return GEMINI_PRIMARY_MODEL;
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

// In-memory key cooldown tracker: `${maskedKey}:${model}` -> expiration timestamp
const keyModelCooldownMap = new Map<string, number>();

/**
 * Checks if a key is currently in cooldown for a specific model due to a 429 Quota error.
 */
export function isKeyInCooldown(key: string, model?: string): boolean {
    const masked = maskApiKey(key);
    const mapKey = model ? `${masked}:${model}` : masked;
    const expiresAt = keyModelCooldownMap.get(mapKey);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        keyModelCooldownMap.delete(mapKey);
        return false;
    }
    return true;
}

/**
 * Marks a key as in cooldown for a specific model for a specified duration.
 */
export function markKeyCooldown(key: string, model?: string, durationMs: number = geminiConfig.keyCooldownMs): void {
    const masked = maskApiKey(key);
    const mapKey = model ? `${masked}:${model}` : masked;
    keyModelCooldownMap.set(mapKey, Date.now() + durationMs);
}

/**
 * Clears cooldown for all keys (useful for testing or manual reset).
 */
export function clearKeyCooldowns(): void {
    keyModelCooldownMap.clear();
}

export interface GeminiGenerateOptions {
    botId: string;
    geminiKeysStr?: string;
    keys?: string[];
    model?: string;
    fallbackModels?: string[];
    history?: any[];
    prompt?: string;
    userParts?: any[];
    systemInstruction?: string;
    responseMimeType?: string;
    firestoreDb?: Firestore;
    // Internal test hook for simulating quota or unavailable responses in tests
    _testSimulate429OnceOnKey?: string;
    _testSimulate503OnceOnModel?: string;
}

export interface GeminiGenerateResult {
    success: boolean;
    text: string | null;
    usedModel: string;
    modelUsed?: string;
    usedKeyMasked: string;
    attempts: number;
    error?: string;
}

/**
 * Executes a Gemini generation request with a complete MODEL x KEY fallback matrix:
 * 1. 429 Quota Handling: Marks key in cooldown, logs GEMINI_429_QUOTA, rotates immediately to next available key.
 * 2. 503 High Demand Handling: Logs GEMINI_503_HIGH_DEMAND, executes exponential backoff with jitter, switches to next fallback model (GEMINI_MODEL_FALLBACK).
 * 3. 404 Model Not Found Handling: Logs GEMINI_MODEL_NOT_FOUND, transitions to next model.
 * 4. Response Validation: Ensures response.text is not empty before registering GEMINI_RESPONSE_SUCCESS.
 * 5. Exhaustion Handling: If all fallbacks fail, logs GEMINI_ALL_FALLBACKS_FAILED without crashing WhatsApp.
 */
export async function generateGeminiContent(options: GeminiGenerateOptions): Promise<GeminiGenerateResult> {
    const {
        botId,
        geminiKeysStr,
        keys: directKeys,
        model: overrideModel,
        fallbackModels: overrideFallbackModels,
        history = [],
        prompt,
        userParts,
        systemInstruction,
        responseMimeType,
        firestoreDb,
        _testSimulate429OnceOnKey,
        _testSimulate503OnceOnModel
    } = options;

    const pipelineStartTime = Date.now();

    const activeFallbackModels: string[] = overrideFallbackModels || (
        overrideModel 
            ? Array.from(new Set([overrideModel, ...GEMINI_FALLBACK_MODELS])) 
            : GEMINI_FALLBACK_MODELS
    );

    // 1. Collect and clean available API keys
    let rawKeys: string[] = directKeys || [];
    if (rawKeys.length === 0 && geminiKeysStr) {
        rawKeys = geminiKeysStr.split(',').map(k => k.trim().replace(/["']/g, '')).filter(Boolean);
    }
    if (rawKeys.length === 0 && process.env.GEMINI_API_KEY) {
        rawKeys = process.env.GEMINI_API_KEY.split(',').map(k => k.trim().replace(/["']/g, '')).filter(Boolean);
    }

    if (rawKeys.length === 0) {
        console.warn(`[GEMINI_NO_KEYS] Bot ${botId} - Nenhuma chave Gemini configurada.`);
        if (firestoreDb) {
            recordAuditLog(firestoreDb, {
                botId,
                action: 'GEMINI_ALL_FALLBACKS_FAILED',
                result: 'ERROR',
                details: 'Nenhuma chave Gemini disponível para processamento'
            }).catch(() => {});
        }
        return {
            success: false,
            text: null,
            usedModel: GEMINI_PRIMARY_MODEL,
            usedKeyMasked: '[NONE]',
            attempts: 0,
            error: 'Nenhuma chave de API Gemini configurada'
        };
    }

    // Prepare contents payload
    let contentsPayload: any[] = [];
    if (history.length > 0) {
        contentsPayload = [...history];
    }
    if (userParts && userParts.length > 0) {
        contentsPayload.push({ role: 'user', parts: userParts });
    } else if (prompt) {
        contentsPayload.push({ role: 'user', parts: [{ text: prompt }] });
    }

    // Test simulation tracking
    let simulated429Triggered = false;
    let simulated503Triggered = false;

    // Track matrix exploration
    let currentKeyIdx = botKeyIndexMap.get(botId) || 0;
    let currentModelIdx = 0;
    let attempts = 0;
    const maxTotalAttempts = Math.min(activeFallbackModels.length * Math.max(rawKeys.length, 1) * 2, 8);
    const modelsAttempted = new Set<string>();
    const keysAttempted = new Set<string>();
    let lastError: any = null;
    let lastErrorType = 'UNKNOWN';

    while (attempts < maxTotalAttempts && currentModelIdx < activeFallbackModels.length) {
        attempts++;

        const currentModel = activeFallbackModels[currentModelIdx];

        // Select key that is not in cooldown for currentModel if possible
        let selectedKey = rawKeys[currentKeyIdx % rawKeys.length];
        let keyOffset = 0;
        while (isKeyInCooldown(selectedKey, currentModel) && keyOffset < rawKeys.length) {
            keyOffset++;
            if (keyOffset < rawKeys.length) {
                selectedKey = rawKeys[(currentKeyIdx + keyOffset) % rawKeys.length];
            }
        }

        // If all keys are in cooldown for currentModel, advance to next model
        if (keyOffset >= rawKeys.length) {
            const nextModelIdx = currentModelIdx + 1;
            const nextModel = nextModelIdx < activeFallbackModels.length ? activeFallbackModels[nextModelIdx] : null;
            if (nextModel) {
                console.log(`[GEMINI_MODEL_FALLBACK] Bot ${botId} | from=${currentModel} | to=${nextModel} | reason=ALL_KEYS_IN_COOLDOWN | attempt=${attempts}`);
                currentModelIdx = nextModelIdx;
                currentKeyIdx = 0;
                continue;
            }
        }

        const effectiveKeyIndex = (currentKeyIdx + keyOffset) % rawKeys.length;
        const currentKey = rawKeys[effectiveKeyIndex];
        const maskedKey = maskApiKey(currentKey);
        const requestStartTime = Date.now();

        modelsAttempted.add(currentModel);
        keysAttempted.add(maskedKey);

        console.log(`[GEMINI_REQUEST] Bot: ${botId} | model=${currentModel} | keyIndex=${effectiveKeyIndex} | key=${maskedKey} | attempt=${attempts}/${maxTotalAttempts}`);

        try {
            // Check for simulated test hooks
            if (_testSimulate429OnceOnKey && maskedKey === maskApiKey(_testSimulate429OnceOnKey) && !simulated429Triggered) {
                simulated429Triggered = true;
                const err: any = new Error('Resource has been exhausted (e.g. check quota).');
                err.status = 429;
                throw err;
            }

            if (_testSimulate503OnceOnModel && currentModel === _testSimulate503OnceOnModel && !simulated503Triggered) {
                simulated503Triggered = true;
                const err: any = new Error('The model is overloaded. Please try again later.');
                err.status = 503;
                throw err;
            }

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

            // 8. VALIDATE RESPONSE TEXT (Anti-empty output)
            const outputText = response.text?.trim() || null;
            if (!outputText) {
                throw new Error('EMPTY_GEMINI_RESPONSE');
            }

            const durationMs = Date.now() - requestStartTime;
            console.log(`[GEMINI_RESPONSE_SUCCESS] Bot: ${botId} | model=${currentModel} | duration=${durationMs}ms | key=${maskedKey}`);

            if (firestoreDb) {
                recordAuditLog(firestoreDb, {
                    botId,
                    action: 'GEMINI_RESPONSE_SUCCESS',
                    result: 'SUCCESS',
                    duration: durationMs,
                    details: `Resposta gerada com sucesso pelo modelo ${currentModel} em ${durationMs}ms (chave: ${maskedKey})`
                }).catch(() => {});
            }

            // Update starting key index for next message round-robin
            botKeyIndexMap.set(botId, (effectiveKeyIndex + 1) % rawKeys.length);

            return {
                success: true,
                text: outputText,
                usedModel: currentModel,
                modelUsed: currentModel,
                usedKeyMasked: maskedKey,
                attempts
            };

        } catch (err: any) {
            lastError = err;
            const durationMs = Date.now() - requestStartTime;
            const errMsg = sanitizeErrorMessage(err?.message || String(err));
            const is404 = errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('NOT_FOUND') || err?.status === 404;
            const is503 = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('overloaded') || errMsg.includes('UNAVAILABLE') || errMsg.includes('unavailable') || err?.status === 503;
            const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('exhausted') || err?.status === 429;
            const isEmptyResponse = errMsg.includes('EMPTY_GEMINI_RESPONSE');

            if (is429) {
                lastErrorType = '429';
                console.warn(`[GEMINI_429_QUOTA] Bot ${botId} | model=${currentModel} | keyIndex=${effectiveKeyIndex} | key=${maskedKey} | reason=QUOTA_EXHAUSTED | cooldown=${geminiConfig.keyCooldownMs}ms`);
                
                // Mark key in cooldown for current model
                markKeyCooldown(currentKey, currentModel, geminiConfig.keyCooldownMs);

                if (firestoreDb) {
                    recordAuditLog(firestoreDb, {
                        botId,
                        action: 'GEMINI_429_QUOTA',
                        result: 'ERROR',
                        duration: durationMs,
                        details: `Chave ${maskedKey} atingiu limite de quota (429) no modelo ${currentModel}. Colocada em cooldown de ${geminiConfig.keyCooldownMs / 1000}s.`
                    }).catch(() => {});
                }

                // Check if another key is available for current model
                let foundNextKey = false;
                if (rawKeys.length > 1) {
                    for (let i = 1; i < rawKeys.length; i++) {
                        const candidateIdx = (effectiveKeyIndex + i) % rawKeys.length;
                        const candidateKey = rawKeys[candidateIdx];
                        if (!isKeyInCooldown(candidateKey, currentModel)) {
                            console.log(`[GEMINI_KEY_ROTATION] Bot ${botId} | from=${effectiveKeyIndex} | to=${candidateIdx} | nextKey=${maskApiKey(candidateKey)}`);
                            currentKeyIdx = candidateIdx;
                            foundNextKey = true;
                            break;
                        }
                    }
                }

                // If no other key available on current model, fallback to NEXT MODEL
                if (!foundNextKey) {
                    const nextModelIdx = currentModelIdx + 1;
                    const nextModel = nextModelIdx < activeFallbackModels.length ? activeFallbackModels[nextModelIdx] : null;

                    if (nextModel) {
                        console.log(`[GEMINI_MODEL_FALLBACK] Bot ${botId} | from=${currentModel} | to=${nextModel} | reason=429_QUOTA | attempt=${attempts}`);
                        currentModelIdx = nextModelIdx;
                        // Reset key rotation for the new model
                        currentKeyIdx = 0;
                    } else if (rawKeys.length > 1) {
                        // All models exhausted on primary key, rotate key anyway
                        currentKeyIdx = (effectiveKeyIndex + 1) % rawKeys.length;
                    }
                }

                // Brief backoff with jitter on 429
                const backoffMs = Math.min(geminiConfig.initialBackoffMs * Math.pow(1.5, attempts - 1), 2000) + Math.floor(Math.random() * 200);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }

            if (is503) {
                lastErrorType = '503';
                console.warn(`[GEMINI_503_HIGH_DEMAND] Bot ${botId} | model=${currentModel} | status=503`);

                const nextModelIdx = currentModelIdx + 1;
                const nextModel = nextModelIdx < activeFallbackModels.length ? activeFallbackModels[nextModelIdx] : null;

                if (nextModel) {
                    console.log(`[GEMINI_MODEL_FALLBACK] Bot ${botId} | from=${currentModel} | to=${nextModel} | reason=503 | attempt=${attempts}`);
                }

                if (firestoreDb) {
                    recordAuditLog(firestoreDb, {
                        botId,
                        action: 'GEMINI_503_HIGH_DEMAND',
                        result: 'ERROR',
                        duration: durationMs,
                        details: `Modelo ${currentModel} com alta demanda (503). ${nextModel ? `Realizando fallback para ${nextModel}.` : 'Todos os modelos testados.'}`
                    }).catch(() => {});
                }

                // Exponential backoff with jitter: attempt 1 -> 1000ms (+jitter), attempt 2 -> 2000ms (+jitter), attempt 3 -> 4000ms (+jitter)
                const baseDelay = geminiConfig.initialBackoffMs;
                const backoffMs = Math.min(baseDelay * Math.pow(2, attempts - 1), 4000) + Math.floor(Math.random() * 250);
                console.log(`[GEMINI_BACKOFF] Bot ${botId} | delay=${backoffMs}ms | attempt=${attempts}`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));

                // Advance to next model in fallback list
                if (nextModel) {
                    currentModelIdx = nextModelIdx;
                } else if (rawKeys.length > 1) {
                    // Reset model index and try next key if available
                    currentModelIdx = 0;
                    currentKeyIdx = (effectiveKeyIndex + 1) % rawKeys.length;
                }
                continue;
            }

            if (is404) {
                lastErrorType = '404';
                console.error(`[GEMINI_MODEL_NOT_FOUND] Bot ${botId} | model=${currentModel} | status=404`);

                const nextModelIdx = currentModelIdx + 1;
                const nextModel = nextModelIdx < activeFallbackModels.length ? activeFallbackModels[nextModelIdx] : null;

                if (nextModel) {
                    console.log(`[GEMINI_MODEL_FALLBACK] Bot ${botId} | from=${currentModel} | to=${nextModel} | reason=404 | attempt=${attempts}`);
                }

                if (firestoreDb) {
                    recordAuditLog(firestoreDb, {
                        botId,
                        action: 'GEMINI_MODEL_NOT_FOUND',
                        result: 'ERROR',
                        duration: durationMs,
                        details: `Modelo ${currentModel} não encontrado (404). ${nextModel ? `Fallback para ${nextModel}.` : 'Nenhum outro modelo disponível.'}`
                    }).catch(() => {});
                }

                if (nextModel) {
                    currentModelIdx = nextModelIdx;
                }
                continue;
            }

            if (isEmptyResponse) {
                lastErrorType = 'EMPTY_RESPONSE';
                console.warn(`[GEMINI_EMPTY_RESPONSE] Bot ${botId} | model=${currentModel}`);
                const nextModelIdx = currentModelIdx + 1;
                if (nextModelIdx < activeFallbackModels.length) {
                    currentModelIdx = nextModelIdx;
                } else {
                    currentKeyIdx = (effectiveKeyIndex + 1) % rawKeys.length;
                }
                continue;
            }

            // General API error
            lastErrorType = 'API_ERROR';
            console.error(`[GEMINI_API_ERROR] Bot ${botId} | key=${maskedKey} | model=${currentModel} | error=${errMsg}`);
            if (firestoreDb) {
                recordAuditLog(firestoreDb, {
                    botId,
                    action: 'GEMINI_KEY_FAILED',
                    result: 'ERROR',
                    duration: durationMs,
                    details: `Chave ${maskedKey} falhou no modelo ${currentModel}: ${errMsg}`
                }).catch(() => {});
            }

            // Try next model or next key
            if (currentModelIdx + 1 < activeFallbackModels.length) {
                currentModelIdx++;
            } else {
                currentKeyIdx = (effectiveKeyIndex + 1) % rawKeys.length;
            }
        }
    }

    const totalDurationMs = Date.now() - pipelineStartTime;
    const finalErrMsg = sanitizeErrorMessage(lastError?.message || 'Falha ao processar com modelo Gemini após todas as tentativas');

    console.error(`[GEMINI_ALL_FALLBACKS_FAILED] Bot ${botId} | modelsAttempted=${Array.from(modelsAttempted).join(',')} | keysAttemptedCount=${keysAttempted.size} | lastErrorType=${lastErrorType} | durationMs=${totalDurationMs}`);

    if (firestoreDb) {
        recordAuditLog(firestoreDb, {
            botId,
            action: 'GEMINI_ALL_FALLBACKS_FAILED',
            result: 'ERROR',
            duration: totalDurationMs,
            details: `Falha após ${attempts} tentativas. Modelos tentados: ${Array.from(modelsAttempted).join(', ')}. Chaves tentadas: ${keysAttempted.size}. Último erro: ${lastErrorType} (${finalErrMsg})`
        }).catch(() => {});
    }

    return {
        success: false,
        text: null,
        usedModel: GEMINI_FALLBACK_MODELS[Math.min(currentModelIdx, GEMINI_FALLBACK_MODELS.length - 1)],
        usedKeyMasked: maskApiKey(rawKeys[currentKeyIdx % rawKeys.length]),
        attempts,
        error: finalErrMsg
    };
}

