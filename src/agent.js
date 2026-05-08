/**
 * HUGO Agent — Hunter Inteligente de Leads
 * Pipeline: collect → qualify → output (CSV ou LeadFlow)
 */
import crypto from 'crypto';
import db from './database.js';
import collector from './collector.js';
import qualifier from './qualifier.js';
import { exportRunToCSV } from './output/csv.js';
import leadflow from './output/leadflow.js';

const OUTPUT_MODE = (process.env.OUTPUT_MODE || 'csv').trim().toLowerCase();

class HugoAgent {
  constructor() {
    this.id = 'hugo';
    this.isRunning = false;
  }

  async execute() {
    if (this.isRunning) {
      console.warn('[HUGO] Já está rodando, pulando');
      return null;
    }

    this.isRunning = true;
    const runId = `hugo-${crypto.randomUUID()}`;
    const startTime = Date.now();

    db.prepare('INSERT INTO hugo_runs (id) VALUES (?)').run(runId);
    console.log(`[HUGO] Pipeline iniciado — Run: ${runId}`);

    try {
      // ── 1. Coleta ──
      console.log('[HUGO] 1/3 Coletando leads...');
      const collectResult = await collector.collectAll(runId);

      db.prepare('UPDATE hugo_runs SET sources_used = ?, leads_found = ? WHERE id = ?')
        .run(JSON.stringify(collectResult.sources), collectResult.found, runId);

      console.log(`[HUGO] Coletados ${collectResult.found} leads de ${collectResult.sources.join(', ') || 'nenhuma fonte'}`);

      if (collectResult.found === 0) {
        this.finishRun(runId, 'no_data', startTime);
        this.isRunning = false;
        return { runId, status: 'no_data' };
      }

      // ── 2. Qualifica ──
      console.log('[HUGO] 2/3 Qualificando...');
      const qualResult = qualifier.qualify(runId);
      db.prepare('UPDATE hugo_runs SET leads_qualified = ? WHERE id = ?')
        .run(qualResult.qualified, runId);
      console.log(`[HUGO] ${qualResult.qualified}/${qualResult.total} qualificados`);

      // ── 3. Output ──
      console.log(`[HUGO] 3/3 Output (mode=${OUTPUT_MODE})...`);
      const outputResult = { csv: null, crm: null };

      if (OUTPUT_MODE === 'csv' || OUTPUT_MODE === 'both') {
        outputResult.csv = await exportRunToCSV(runId);
      }

      if (OUTPUT_MODE === 'leadflow' || OUTPUT_MODE === 'both') {
        outputResult.crm = await leadflow.sendLeads(runId);
        if (outputResult.crm) {
          db.prepare('UPDATE hugo_runs SET leads_sent_crm = ? WHERE id = ?')
            .run(outputResult.crm.sent, runId);
        }
      }

      // ── Finaliza ──
      this.finishRun(runId, 'completed', startTime);
      const duration = Math.round((Date.now() - startTime) / 1000);

      const summary = {
        runId, status: 'completed', duration,
        found: collectResult.found,
        qualified: qualResult.qualified,
        csv: outputResult.csv,
        crm: outputResult.crm,
      };

      console.log(`[HUGO] Pipeline completo em ${duration}s — encontrados=${collectResult.found}, qualificados=${qualResult.qualified}`);
      this.isRunning = false;
      return summary;

    } catch (err) {
      console.error('[HUGO] Erro no pipeline:', err);
      this.finishRun(runId, 'error', startTime, err.message);
      this.isRunning = false;
      throw err;
    }
  }

  finishRun(runId, status, startTime, error = null) {
    db.prepare("UPDATE hugo_runs SET finished_at = datetime('now'), status = ?, error = ? WHERE id = ?")
      .run(status, error, runId);
  }
}

export default new HugoAgent();
