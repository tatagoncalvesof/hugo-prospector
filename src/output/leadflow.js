/**
 * HUGO Output — LeadFlow CRM (opcional)
 * SEM credenciais hardcoded. Lê tudo do .env. Lança erro se não configurado.
 */
import db from '../database.js';

const LEADFLOW_URL = process.env.LEADFLOW_URL;
const LEADFLOW_EMAIL = process.env.LEADFLOW_EMAIL;
const LEADFLOW_PASSWORD = process.env.LEADFLOW_PASSWORD;
const FUNNEL_NAME = process.env.LEADFLOW_FUNNEL_NAME || 'Prospecção HUGO';

class LeadFlowOutput {
  constructor() {
    this.token = null;
    this.funnelId = null;
    this.tagIds = {};
  }

  isConfigured() {
    return !!(LEADFLOW_URL && LEADFLOW_EMAIL && LEADFLOW_PASSWORD);
  }

  async auth() {
    if (this.token) return this.token;
    if (!this.isConfigured()) {
      throw new Error('LeadFlow não configurado. Defina LEADFLOW_URL, LEADFLOW_EMAIL, LEADFLOW_PASSWORD no .env');
    }

    const res = await fetch(`${LEADFLOW_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: LEADFLOW_EMAIL, password: LEADFLOW_PASSWORD }),
    });

    if (!res.ok) throw new Error(`LeadFlow auth failed: ${res.status}`);
    const data = await res.json();
    this.token = data.token;
    console.log('[LeadFlow] Authenticated');
    return this.token;
  }

  async request(path, options = {}) {
    await this.auth();
    const doFetch = () => fetch(`${LEADFLOW_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...(options.headers || {}),
      },
    });

    let res = await doFetch();
    if (res.status === 401) {
      this.token = null;
      await this.auth();
      res = await doFetch();
    }
    return res.json();
  }

  async ensureFunnel() {
    if (this.funnelId) return this.funnelId;

    const funnels = await this.request('/api/funnels');
    const existing = (funnels || []).find(f =>
      f.name && f.name.toLowerCase() === FUNNEL_NAME.toLowerCase()
    );

    if (existing) {
      this.funnelId = existing.id;
      console.log(`[LeadFlow] Found funnel: ${existing.name}`);
      return this.funnelId;
    }

    const result = await this.request('/api/funnels', {
      method: 'POST',
      body: JSON.stringify({
        name: FUNNEL_NAME,
        description: 'Leads capturados pelo HUGO — prospecção automática',
        type: 'sales',
        stages: [
          { name: 'Capturado', color: '#64748b', win_probability: 5 },
          { name: 'Enriquecido', color: '#8b5cf6', win_probability: 15 },
          { name: 'Primeiro Contato', color: '#2563eb', win_probability: 25 },
          { name: 'Respondeu', color: '#f59e0b', win_probability: 40 },
          { name: 'Agendou Call', color: '#f97316', win_probability: 60 },
          { name: 'Qualificado', color: '#10b981', win_probability: 80 },
        ],
      }),
    });

    this.funnelId = result.id;
    console.log(`[LeadFlow] Created funnel: ${FUNNEL_NAME}`);
    return this.funnelId;
  }

  async ensureTags() {
    if (Object.keys(this.tagIds).length > 0) return this.tagIds;

    const existing = await this.request('/api/tags');
    const tagsNeeded = [
      { name: 'hugo-prospeccao', color: '#10B981' },
      { name: 'high-ticket', color: '#F59E0B' },
      { name: 'instagram-fraco', color: '#EF4444' },
    ];

    for (const tag of tagsNeeded) {
      const found = (existing || []).find(t => t.name === tag.name);
      if (found) {
        this.tagIds[tag.name] = found.id;
      } else {
        const created = await this.request('/api/tags', {
          method: 'POST',
          body: JSON.stringify(tag),
        });
        if (created?.id) this.tagIds[tag.name] = created.id;
      }
    }
    return this.tagIds;
  }

  async sendLeads(runId) {
    if (!this.isConfigured()) {
      console.log('[LeadFlow] Não configurado, pulando');
      return { sent: 0, errors: 0 };
    }

    await this.ensureFunnel();
    await this.ensureTags();

    const leads = db.prepare(`
      SELECT * FROM hugo_leads
      WHERE run_id = ? AND is_qualified = 1 AND sent_to_crm = 0
      ORDER BY score DESC
    `).all(runId);

    if (leads.length === 0) return { sent: 0, errors: 0 };

    let sent = 0, errors = 0;

    for (const lead of leads) {
      try {
        const customFields = {
          specialty: lead.specialty || '',
          clinic_name: lead.clinic_name || '',
          google_rating: lead.google_rating || 0,
          google_reviews: lead.google_reviews || 0,
          hugo_score: lead.score || 0,
          hugo_source: lead.source || '',
          instagram: lead.instagram || '',
          instagram_followers: lead.instagram_followers || 0,
          linkedin_url: lead.linkedin_url || '',
          google_maps_url: lead.google_maps_url || '',
        };

        const notes = [
          `[HUGO] Lead via ${lead.source}`,
          lead.specialty ? `Especialidade: ${lead.specialty}` : '',
          lead.clinic_name ? `Clínica: ${lead.clinic_name}` : '',
          lead.google_rating ? `Google: ${lead.google_rating}★ (${lead.google_reviews} avaliações)` : '',
          lead.instagram ? `Instagram: @${lead.instagram} (${lead.instagram_followers} seguidores)` : '',
          lead.instagram_followers > 0 && lead.instagram_followers < 1000 ? '⚠️ Instagram fraco — oportunidade de posicionamento' : '',
          `Score HUGO: ${lead.score}/100`,
        ].filter(Boolean).join('\n');

        const crmLead = await this.request('/api/leads', {
          method: 'POST',
          body: JSON.stringify({
            name: lead.name || lead.clinic_name || '',
            email: lead.email || '',
            phone: lead.phone || '',
            company: lead.clinic_name || '',
            position: lead.specialty || '',
            city: lead.city || '',
            state: lead.state || '',
            source: 'prospeccao',
            source_detail: `hugo-${lead.source}`,
            notes,
            custom_fields: customFields,
          }),
        });

        if (crmLead?.id) {
          try {
            await this.request(`/api/funnels/${this.funnelId}/leads`, {
              method: 'POST',
              body: JSON.stringify({ lead_id: crmLead.id }),
            });
          } catch (fErr) { /* já no funil, ok */ }

          const tagsToAdd = ['hugo-prospeccao'];
          if (lead.score >= 70) tagsToAdd.push('high-ticket');
          if (lead.instagram_followers > 0 && lead.instagram_followers < 1000) tagsToAdd.push('instagram-fraco');

          for (const tagName of tagsToAdd) {
            if (this.tagIds[tagName]) {
              try {
                await this.request(`/api/leads/${crmLead.id}/tags`, {
                  method: 'POST',
                  body: JSON.stringify({ tag_id: this.tagIds[tagName] }),
                });
              } catch (tErr) { /* tag já existe */ }
            }
          }

          db.prepare('UPDATE hugo_leads SET sent_to_crm = 1, crm_lead_id = ? WHERE id = ?')
            .run(crmLead.id, lead.id);
          sent++;
        } else {
          db.prepare('UPDATE hugo_leads SET crm_error = ? WHERE id = ?')
            .run('No ID returned', lead.id);
          errors++;
        }

        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        db.prepare('UPDATE hugo_leads SET crm_error = ? WHERE id = ?')
          .run(err.message, lead.id);
        errors++;
      }
    }

    console.log(`[LeadFlow] Sent ${sent} leads, ${errors} errors`);
    return { sent, errors };
  }
}

export default new LeadFlowOutput();
