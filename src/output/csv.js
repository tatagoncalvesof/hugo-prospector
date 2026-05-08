/**
 * HUGO Output — CSV
 * Exporta leads qualificados para arquivo CSV em data/exports/
 */
import db from '../database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(__dirname, '..', '..', 'data', 'exports');
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  if (/[",\n]/.test(str)) return `"${str}"`;
  return str;
}

export async function exportRunToCSV(runId) {
  const leads = db.prepare(`
    SELECT * FROM hugo_leads
    WHERE run_id = ? AND is_qualified = 1 AND exported_csv = 0
    ORDER BY score DESC
  `).all(runId);

  if (leads.length === 0) {
    console.log('[CSV] No new qualified leads to export');
    return { exported: 0, file: null };
  }

  const headers = [
    'score', 'name', 'phone', 'email', 'specialty', 'clinic_name',
    'city', 'state', 'address', 'website', 'instagram', 'instagram_followers',
    'linkedin_url', 'google_maps_url', 'google_rating', 'google_reviews',
    'source', 'collected_at',
  ];

  const rows = leads.map(lead =>
    headers.map(h => escapeCsv(lead[h])).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');

  const date = new Date().toISOString().slice(0, 10);
  const filename = `hugo-leads-${date}-${runId.slice(-8)}.csv`;
  const filepath = path.join(exportsDir, filename);
  fs.writeFileSync(filepath, csv, 'utf-8');

  // Marca como exportado
  const update = db.prepare('UPDATE hugo_leads SET exported_csv = 1 WHERE id = ?');
  const tx = db.transaction(() => { for (const l of leads) update.run(l.id); });
  tx();

  console.log(`[CSV] Exported ${leads.length} leads → ${filepath}`);
  return { exported: leads.length, file: filepath };
}
