/**
 * HUGO Routes — API + dashboard
 */
import { Router } from 'express';
import db from './database.js';
import hugoAgent from './agent.js';

const router = Router();

router.get('/status', (req, res) => {
  const lastRun = db.prepare('SELECT * FROM hugo_runs ORDER BY started_at DESC LIMIT 1').get();
  const totalLeads = db.prepare('SELECT COUNT(*) as c FROM hugo_leads').get()?.c || 0;
  const qualifiedLeads = db.prepare('SELECT COUNT(*) as c FROM hugo_leads WHERE is_qualified = 1').get()?.c || 0;
  const sentCRM = db.prepare('SELECT COUNT(*) as c FROM hugo_leads WHERE sent_to_crm = 1').get()?.c || 0;
  const totalRuns = db.prepare('SELECT COUNT(*) as c FROM hugo_runs').get()?.c || 0;

  res.json({
    isRunning: hugoAgent.isRunning,
    config: {
      niche: process.env.NICHE || 'dermatologista',
      cities: process.env.CITIES || '',
      output_mode: process.env.OUTPUT_MODE || 'csv',
      cron: process.env.RUN_AT || '0 7 * * *',
    },
    lastRun: lastRun ? { ...lastRun, sources_used: JSON.parse(lastRun.sources_used || '[]') } : null,
    stats: { totalLeads, qualifiedLeads, sentCRM, totalRuns },
  });
});

router.get('/runs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const runs = db.prepare('SELECT * FROM hugo_runs ORDER BY started_at DESC LIMIT ?').all(limit);
  res.json(runs.map(r => ({ ...r, sources_used: JSON.parse(r.sources_used || '[]') })));
});

router.get('/leads', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const { qualified_only, source, specialty, city, sort } = req.query;

  let query = 'SELECT * FROM hugo_leads WHERE 1=1';
  const params = [];

  if (qualified_only === 'true') query += ' AND is_qualified = 1';
  if (source) { query += ' AND source = ?'; params.push(source); }
  if (specialty) { query += ' AND specialty LIKE ?'; params.push(`%${specialty}%`); }
  if (city) { query += ' AND city LIKE ?'; params.push(`%${city}%`); }

  query += sort === 'score' ? ' ORDER BY score DESC' : ' ORDER BY collected_at DESC';
  query += ' LIMIT ?';
  params.push(limit);

  const leads = db.prepare(query).all(...params);
  res.json(leads.map(l => ({ ...l, score_breakdown: JSON.parse(l.score_breakdown || '{}') })));
});

router.get('/leads/stats', (req, res) => {
  const bySource = db.prepare(`
    SELECT source, COUNT(*) as total, SUM(is_qualified) as qualified, SUM(sent_to_crm) as in_crm
    FROM hugo_leads GROUP BY source
  `).all();

  const bySpecialty = db.prepare(`
    SELECT specialty, COUNT(*) as total, SUM(is_qualified) as qualified
    FROM hugo_leads WHERE specialty != '' GROUP BY specialty ORDER BY qualified DESC
  `).all();

  const byCity = db.prepare(`
    SELECT city, state, COUNT(*) as total, SUM(is_qualified) as qualified
    FROM hugo_leads WHERE city != '' GROUP BY city, state ORDER BY qualified DESC
  `).all();

  const scoreDistribution = db.prepare(`
    SELECT
      CASE
        WHEN score >= 80 THEN 'A (80-100)'
        WHEN score >= 60 THEN 'B (60-79)'
        WHEN score >= 50 THEN 'C (50-59)'
        WHEN score >= 30 THEN 'D (30-49)'
        ELSE 'F (0-29)'
      END as grade,
      COUNT(*) as count
    FROM hugo_leads GROUP BY grade ORDER BY grade
  `).all();

  const igOpportunities = db.prepare(`
    SELECT name, instagram, instagram_followers, specialty, city, score
    FROM hugo_leads
    WHERE instagram IS NOT NULL AND instagram != ''
    AND instagram_followers > 0 AND instagram_followers < 1000
    AND is_qualified = 1
    ORDER BY score DESC LIMIT 20
  `).all();

  res.json({ bySource, bySpecialty, byCity, scoreDistribution, igOpportunities });
});

// ── Cities ──
router.get('/cities', (req, res) => {
  res.json(db.prepare('SELECT * FROM hugo_cities ORDER BY is_active DESC, city ASC').all());
});

router.post('/cities', (req, res) => {
  const { city, state } = req.body;
  if (!city || !state) return res.status(400).json({ error: 'city and state required' });
  try {
    db.prepare('INSERT INTO hugo_cities (city, state) VALUES (?, ?)').run(city, state);
    res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'City already exists' });
    throw err;
  }
});

router.put('/cities/:id', (req, res) => {
  const { is_active } = req.body;
  db.prepare('UPDATE hugo_cities SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ── Specialties ──
router.get('/specialties', (req, res) => {
  const specs = db.prepare('SELECT * FROM hugo_specialties ORDER BY priority DESC').all();
  res.json(specs.map(s => ({ ...s, search_terms: JSON.parse(s.search_terms || '[]') })));
});

router.post('/specialties', (req, res) => {
  const { name, search_terms, priority } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    db.prepare('INSERT INTO hugo_specialties (name, search_terms, priority) VALUES (?, ?, ?)')
      .run(name, JSON.stringify(search_terms || [name.toLowerCase()]), priority || 5);
    res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Specialty already exists' });
    throw err;
  }
});

// ── Manual Run ──
router.post('/run', async (req, res) => {
  if (hugoAgent.isRunning) return res.status(409).json({ error: 'Already running' });
  try {
    // Não bloqueia request — roda em background
    hugoAgent.execute().catch(err => console.error('[HUGO Manual Run]', err));
    res.json({ ok: true, message: 'Pipeline iniciado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
