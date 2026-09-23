import fs from 'fs';
import path from 'path';
import { 
    collection, 
    doc, 
    getDocs, 
    setDoc, 
    deleteDoc, 
    writeBatch,
    getDoc
} from 'firebase/firestore';

/**
 * Sanitizes a Baileys session filename so it becomes a valid Firestore document ID.
 * Firestore doc IDs cannot contain '/' and cannot be solely '.' or '..' or match '__.*__'.
 */
export function sanitizeAuthDocId(fileName: string): string {
    return fileName
        .replace(/[\/\\#$\[\]]/g, '_')
        .replace(/:/g, '-')
        .replace(/^__/, 'session__');
}

/**
 * Restores all Baileys authentication files from Firestore into the local auth folder.
 * This guarantees that when a new deploy or container restart occurs,
 * the existing WhatsApp connection credentials and keys are fully preserved.
 */
export async function restoreAuthStateFromFirestore(
    firestoreDb: any, 
    botId: string, 
    authPath: string
): Promise<{ restored: boolean; fileCount: number; hasCreds: boolean }> {
    try {
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }

        const authColl = collection(firestoreDb, 'bots', botId, 'baileys_auth');
        const snapshot = await getDocs(authColl);

        if (snapshot.empty) {
            return { restored: false, fileCount: 0, hasCreds: false };
        }

        let fileCount = 0;
        let hasCreds = false;

        for (const docItem of snapshot.docs) {
            const data = docItem.data();
            const fileName = data.fileName || (docItem.id === 'creds' ? 'creds.json' : `${docItem.id}.json`);
            const targetPath = path.join(authPath, fileName);

            if (data.rawContent && typeof data.rawContent === 'string') {
                fs.writeFileSync(targetPath, data.rawContent, 'utf8');
                fileCount++;
                if (fileName === 'creds.json') {
                    hasCreds = true;
                }
            }
        }

        console.log(`[Bot ${botId}] [SESSION_PERSISTENCE] Restaurados ${fileCount} arquivos de autenticação do Firestore (creds.json: ${hasCreds}).`);
        return { restored: fileCount > 0, fileCount, hasCreds };
    } catch (error) {
        console.error(`[Bot ${botId}] [SESSION_PERSISTENCE] Erro ao restaurar credenciais do Firestore:`, error);
        return { restored: false, fileCount: 0, hasCreds: false };
    }
}

/**
 * Persists the primary creds.json to Firestore immediately when Baileys triggers creds.update.
 */
export async function persistCredsToFirestore(
    firestoreDb: any, 
    botId: string, 
    authPath: string
): Promise<void> {
    try {
        const credsPath = path.join(authPath, 'creds.json');
        if (!fs.existsSync(credsPath)) return;

        const rawContent = fs.readFileSync(credsPath, 'utf8');
        const docRef = doc(firestoreDb, 'bots', botId, 'baileys_auth', 'creds');
        await setDoc(docRef, {
            fileName: 'creds.json',
            rawContent,
            category: 'creds',
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[Bot ${botId}] [SESSION_PERSISTENCE] Erro ao sincronizar creds.json:`, error);
    }
}

/**
 * Persists updated session keys (pre-keys, session keys, sender-keys) to Firestore.
 */
export async function persistKeyBatchToFirestore(
    firestoreDb: any, 
    botId: string, 
    data: any, 
    BufferJSONReplacer?: any
): Promise<void> {
    try {
        const batch = writeBatch(firestoreDb);
        let opCount = 0;

        for (const category in data) {
            for (const id in data[category]) {
                const value = data[category][id];
                const fileName = `${category}-${id}.json`;
                const docId = sanitizeAuthDocId(fileName);
                const docRef = doc(firestoreDb, 'bots', botId, 'baileys_auth', docId);

                if (value) {
                    const rawContent = JSON.stringify(value, BufferJSONReplacer || undefined);
                    batch.set(docRef, {
                        fileName,
                        rawContent,
                        category,
                        updatedAt: new Date().toISOString()
                    });
                    opCount++;
                } else {
                    batch.delete(docRef);
                    opCount++;
                }

                if (opCount >= 400) {
                    await batch.commit();
                    opCount = 0;
                }
            }
        }

        if (opCount > 0) {
            await batch.commit();
        }
    } catch (error) {
        console.error(`[Bot ${botId}] [SESSION_PERSISTENCE] Erro ao sincronizar chaves de sessão:`, error);
    }
}

/**
 * Full flush: scans the local auth folder and persists all JSON files into Firestore.
 * Used upon successful connection, periodic sync, and graceful shutdown on deploy/restart.
 */
export async function syncAllAuthFilesToFirestore(
    firestoreDb: any, 
    botId: string, 
    authPath: string
): Promise<number> {
    try {
        if (!fs.existsSync(authPath)) return 0;

        const files = fs.readdirSync(authPath).filter(f => f.endsWith('.json'));
        if (files.length === 0) return 0;

        let batch = writeBatch(firestoreDb);
        let opCount = 0;
        let totalSaved = 0;

        for (const file of files) {
            const filePath = path.join(authPath, file);
            try {
                const rawContent = fs.readFileSync(filePath, 'utf8');
                const docId = file === 'creds.json' ? 'creds' : sanitizeAuthDocId(file);
                const docRef = doc(firestoreDb, 'bots', botId, 'baileys_auth', docId);

                batch.set(docRef, {
                    fileName: file,
                    rawContent,
                    category: file.split('-')[0] || 'general',
                    updatedAt: new Date().toISOString()
                });
                opCount++;
                totalSaved++;

                if (opCount >= 400) {
                    await batch.commit();
                    batch = writeBatch(firestoreDb);
                    opCount = 0;
                }
            } catch (err) {
                // skip unreadable single file
            }
        }

        if (opCount > 0) {
            await batch.commit();
        }

        console.log(`[Bot ${botId}] [SESSION_PERSISTENCE] Sincronizados com sucesso ${totalSaved} arquivos de autenticação no Firestore.`);
        return totalSaved;
    } catch (error) {
        console.error(`[Bot ${botId}] [SESSION_PERSISTENCE] Erro no sync completo de arquivos:`, error);
        return 0;
    }
}

/**
 * Clears authentication files from Firestore and local disk.
 * MUST only be invoked when the user explicitly unlinks/resets the session
 * or when DisconnectReason.loggedOut is received from WhatsApp.
 */
export async function clearAuthStateEverywhere(
    firestoreDb: any, 
    botId: string, 
    authPath: string
): Promise<void> {
    console.log(`[Bot ${botId}] [SESSION_PERSISTENCE] Limpando dados de autenticação (Desconexão intencional ou Logged Out)...`);
    
    // 1. Clear local files
    if (fs.existsSync(authPath)) {
        try {
            fs.rmSync(authPath, { recursive: true, force: true });
        } catch (e) {
            console.error(`[Bot ${botId}] Erro ao apagar pasta local auth_info:`, e);
        }
    }

    // 2. Clear Firestore subcollection
    try {
        const authColl = collection(firestoreDb, 'bots', botId, 'baileys_auth');
        const snapshot = await getDocs(authColl);
        if (!snapshot.empty) {
            let batch = writeBatch(firestoreDb);
            let opCount = 0;
            for (const docItem of snapshot.docs) {
                batch.delete(docItem.ref);
                opCount++;
                if (opCount >= 400) {
                    await batch.commit();
                    batch = writeBatch(firestoreDb);
                    opCount = 0;
                }
            }
            if (opCount > 0) {
                await batch.commit();
            }
            console.log(`[Bot ${botId}] [SESSION_PERSISTENCE] Removidos ${snapshot.size} registros de autenticação do Firestore.`);
        }
    } catch (error) {
        console.error(`[Bot ${botId}] [SESSION_PERSISTENCE] Erro ao limpar subcoleção baileys_auth:`, error);
    }
}

/**
 * Checks if a bot has persistent authentication credentials saved in Firestore.
 */
export async function hasPersistedSessionInFirestore(
    firestoreDb: any, 
    botId: string
): Promise<boolean> {
    try {
        const credsDoc = await getDoc(doc(firestoreDb, 'bots', botId, 'baileys_auth', 'creds'));
        return credsDoc.exists();
    } catch {
        return false;
    }
}
