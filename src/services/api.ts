import { Bot, AdminStats, BotStats, MemoryContact, AuditLog, GroupConfig, GroupWarning, GroupLog } from '../types';

class ApiService {
  private getHeaders(token?: string, isAdmin: boolean = true): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (isAdmin) {
      headers['x-requested-by'] = 'techstar-admin';
    }
    if (token) {
      headers['x-bot-token'] = token;
    }
    return headers;
  }

  // Admin Bot Management
  async getBots(): Promise<Bot[]> {
    const res = await fetch('/api/admin/bots', {
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao listar bots');
    return res.json();
  }

  async createBot(name: string): Promise<{ id: string; accessToken: string; status: string }> {
    const res = await fetch('/api/admin/bots', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Falha ao criar bot');
    return res.json();
  }

  async toggleBot(botId: string): Promise<{ status: string }> {
    const res = await fetch(`/api/admin/bots/${botId}/toggle`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao alternar estado do bot');
    return res.json();
  }

  async deleteBot(botId: string): Promise<{ status: string }> {
    const res = await fetch(`/api/admin/bots/${botId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao excluir bot');
    return res.json();
  }

  async regenerateToken(botId: string): Promise<{ accessToken: string; status: string }> {
    const res = await fetch(`/api/admin/bots/${botId}/regenerate-token`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao regenerar token');
    return res.json();
  }

  // Admin Aggregated Stats
  async getAdminStats(): Promise<AdminStats> {
    const res = await fetch('/api/admin/stats', {
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao carregar métricas globais');
    return res.json();
  }

  // Individual Bot Operations
  async getBotConfig(botId: string, token?: string, isAdmin: boolean = true): Promise<Bot> {
    const url = token ? `/api/bot/${botId}/config?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/config`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Acesso não autorizado ou token inválido');
      if (res.status === 404) throw new Error('Bot não encontrado');
      throw new Error('Erro ao carregar configurações do bot');
    }
    return res.json();
  }

  async saveBotConfig(botId: string, config: Partial<Bot>, token?: string, isAdmin: boolean = true): Promise<{ status: string; config?: Bot }> {
    const url = token ? `/api/bot/${botId}/config?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/config`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao salvar configurações do bot');
    }
    return res.json();
  }

  async resetBotSession(botId: string, token?: string, isAdmin: boolean = true): Promise<{ status: string }> {
    const url = token ? `/api/bot/${botId}/reset?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/reset`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao reiniciar sessão do WhatsApp');
    }
    return res.json();
  }

  async getBotAuditLogs(botId: string, token?: string, isAdmin: boolean = true): Promise<AuditLog[]> {
    const url = token ? `/api/bot/${botId}/audit-logs?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/audit-logs`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) throw new Error('Falha ao buscar logs de auditoria');
    return res.json();
  }

  async getBotStats(botId: string, token?: string, isAdmin: boolean = true): Promise<BotStats> {
    const url = token ? `/api/bot/${botId}/stats?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/stats`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) throw new Error('Falha ao buscar estatísticas do bot');
    return res.json();
  }

  async getBotMemory(botId: string, token?: string, isAdmin: boolean = true): Promise<MemoryContact[]> {
    const url = token ? `/api/bot/${botId}/memory?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/memory`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) throw new Error('Falha ao listar memória de conversas');
    return res.json();
  }

  async clearBotMemory(botId: string, token?: string, isAdmin: boolean = true): Promise<{ status: string; clearedCount: number }> {
    const url = token ? `/api/bot/${botId}/memory/clear?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/memory/clear`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao limpar memória do bot');
    }
    return res.json();
  }

  async requestPairingCode(botId: string, phoneNumber: string, token?: string, isAdmin: boolean = true): Promise<string> {
    const url = token ? `/api/bot/${botId}/pairing-code?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/pairing-code`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify({ phoneNumber })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code) {
      throw new Error(data.error || 'Falha ao solicitar código de emparelhamento no WhatsApp.');
    }
    return data.code;
  }

  async disconnectBotSession(botId: string, token?: string, isAdmin: boolean = true): Promise<{ success: boolean; status: string }> {
    const url = token ? `/api/bot/${botId}/disconnect?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/disconnect`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao desconectar WhatsApp');
    }
    return res.json();
  }

  // ==========================================
  // Dedicated AI & Motivation Real API Methods
  // ==========================================

  async updateAiSettings(
    botId: string, 
    aiConfig: { geminiKeys?: string; aiEnabled?: boolean; aiModel?: string; systemPrompt?: string; removeGeminiKeys?: boolean }, 
    token?: string, 
    isAdmin: boolean = true
  ): Promise<{ success: boolean; status: string; hasGeminiKeys: boolean }> {
    const url = token ? `/api/bots/${botId}/ai?token=${encodeURIComponent(token)}` : `/api/bots/${botId}/ai`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify(aiConfig)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao atualizar configurações de IA');
    }
    return res.json();
  }

  async testGeminiKey(
    botId: string, 
    testKey?: string, 
    model?: string, 
    token?: string, 
    isAdmin: boolean = true
  ): Promise<{ success: boolean; message: string; modelUsed: string; durationMs: number }> {
    const url = token ? `/api/bots/${botId}/ai/test?token=${encodeURIComponent(token)}` : `/api/bots/${botId}/ai/test`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify({ testKey, model })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao testar chave Gemini');
    }
    return data;
  }

  async testBotMotivation(
    botId: string, 
    token?: string, 
    isAdmin: boolean = true
  ): Promise<{ success: boolean; status: string; quote: string; formattedMessage: string; sentToWhatsApp: boolean }> {
    const url = token ? `/api/bots/${botId}/test-motivation?token=${encodeURIComponent(token)}` : `/api/bots/${botId}/test-motivation`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao testar mensagem motivacional');
    }
    return data;
  }

  // ==========================================
  // Group Control & Automation API Methods
  // ==========================================

  async getBotGroups(botId: string, token?: string, isAdmin: boolean = true): Promise<Array<{
    groupId: string;
    groupName: string;
    groupDesc?: string;
    participantCount: number;
    botIsAdmin: boolean;
    config: GroupConfig;
  }>> {
    const url = token ? `/api/bot/${botId}/groups?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/groups`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao listar grupos do bot');
    }
    return res.json();
  }

  async getBotAdminGroups(botId: string, token?: string, isAdmin: boolean = true): Promise<Array<{
    groupId: string;
    groupName: string;
    groupDesc?: string;
    participantCount: number;
    botIsAdmin: boolean;
    botRole: 'admin' | 'superadmin' | 'member';
    canDeleteMessages: boolean;
    canKickParticipants: boolean;
    canEditGroupInfo: boolean;
    lastSyncedAt?: string;
    config: GroupConfig;
  }>> {
    const url = token ? `/api/bot/${botId}/admin-groups?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/admin-groups`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao listar grupos onde o bot é admin');
    }
    return res.json();
  }

  async getGroupDetails(botId: string, groupId: string, token?: string, isAdmin: boolean = true): Promise<{
    groupId: string;
    groupName: string;
    groupDesc?: string;
    participantCount: number;
    botIsAdmin: boolean;
    config: GroupConfig;
    activeWarnings: number;
    recentLogs: GroupLog[];
  }> {
    const url = token ? `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao carregar detalhes do grupo');
    }
    return res.json();
  }

  async saveGroupConfig(botId: string, groupId: string, config: Partial<GroupConfig>, token?: string, isAdmin: boolean = true): Promise<{ status: string; config: GroupConfig }> {
    const url = token ? `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao salvar configurações do grupo');
    }
    return res.json();
  }

  async getGroupWarnings(botId: string, groupId: string, token?: string, isAdmin: boolean = true): Promise<GroupWarning[]> {
    const url = token ? `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/warnings?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/warnings`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao buscar advertências do grupo');
    }
    return res.json();
  }

  async resetGroupWarnings(botId: string, groupId: string, participantPhone?: string, token?: string, isAdmin: boolean = true): Promise<{ status: string }> {
    const url = token ? `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/warnings/reset?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/warnings/reset`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify({ participantPhone })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao zerar advertências');
    }
    return res.json();
  }

  async getGroupLogs(botId: string, groupId: string, token?: string, isAdmin: boolean = true): Promise<GroupLog[]> {
    const url = token ? `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/logs?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/logs`;
    const res = await fetch(url, {
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao carregar logs do grupo');
    }
    return res.json();
  }

  async testGroupMotivation(botId: string, groupId: string, token?: string, isAdmin: boolean = true): Promise<{ status: string; details: string }> {
    const url = token ? `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/test-motivation?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/test-motivation`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao enviar mensagem motivacional de teste');
    }
    return res.json();
  }

  async executeGroupAction(botId: string, groupId: string, action: string, participantJid?: string, token?: string, isAdmin: boolean = true): Promise<{ status: string }> {
    const url = token ? `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/action?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/groups/${encodeURIComponent(groupId)}/action`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify({ action, participantJid })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao executar ação no grupo');
    }
    return res.json();
  }

  async changeBotPin(botId: string, newPin: string, confirmPin: string, token?: string, isAdmin: boolean = false): Promise<{ success: boolean; message: string; accessToken?: string }> {
    const url = token ? `/api/bot/${botId}/change-pin?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/change-pin`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify({ newPin, confirmPin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao alterar o PIN do bot.');
    }
    return data;
  }

  async disconnectWhatsApp(botId: string, token?: string, isAdmin: boolean = false): Promise<{ success: boolean; message: string; status: string }> {
    const url = token ? `/api/bot/${botId}/disconnect?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/disconnect`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao desconectar o WhatsApp.');
    }
    return data;
  }

  async reconnectWhatsApp(botId: string, token?: string, isAdmin: boolean = false): Promise<{ success: boolean; message: string }> {
    const url = token ? `/api/bot/${botId}/reconnect?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/reconnect`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao reconectar o WhatsApp.');
    }
    return data;
  }

  async resetBotConfig(botId: string, token?: string, isAdmin: boolean = false): Promise<{ success: boolean; message: string }> {
    const url = token ? `/api/bot/${botId}/reset-config?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/reset-config`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao resetar configurações.');
    }
    return data;
  }

  async deleteBotInstance(botId: string, token?: string, isAdmin: boolean = false): Promise<{ success: boolean; message: string }> {
    const url = token ? `/api/bot/${botId}?token=${encodeURIComponent(token)}` : `/api/bot/${botId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(token, isAdmin)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao excluir o bot.');
    }
    return data;
  }
  async generatePdf(botId: string, pdfOptions: any, token?: string, isAdmin: boolean = false): Promise<Blob> {
    const url = token ? `/api/bot/${botId}/pdf/generate?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/pdf/generate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify(pdfOptions)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao gerar documento PDF.');
    }
    return res.blob();
  }

  async sendPdfViaWhatsApp(botId: string, payload: any, token?: string, isAdmin: boolean = false): Promise<{ success: boolean; status: string; messageId?: string; durationMs?: number }> {
    const url = token ? `/api/bot/${botId}/pdf/send?token=${encodeURIComponent(token)}` : `/api/bot/${botId}/pdf/send`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token, isAdmin),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao enviar PDF pelo WhatsApp.');
    }
    return data;
  }

  async resetWhatsAppSession(botId: string, token?: string, isAdmin: boolean = false): Promise<{ status: string }> {
    return this.resetBotSession(botId, token, isAdmin);
  }

  async generatePdfDocument(botId: string, pdfOptions: any, token?: string, isAdmin: boolean = false): Promise<Blob> {
    return this.generatePdf(botId, pdfOptions, token, isAdmin);
  }
}

export const api = new ApiService();
