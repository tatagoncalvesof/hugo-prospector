/**
 * HUGO Prospector — entry point
 * Express + node-cron + dashboard
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';

import { runMigration } from './migration.js';
import hugoAgent from './agent.js';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3920', 10);
const RUN_AT = (process.env.RUN_AT || '0 7 * * *').trim();
const DASHBOARD_USER = process.env.DASHBOARD_USER;
const DASHBOARD_PASS = process.env.DASHBOARD_PASS;

// 1. Setup DB
runMigration();

// 2. Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Optional basic auth
if (DASHBOARD_USER && DASHBOARD_PASS) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization || '';
    const expected = 'Basic ' + Buffer.from(`${DASHBOARD_USER}:${DASHBOARD_PASS}`).toString('base64');
    if (auth !== expected) {
      res.set('WWW-Authenticate', 'Basic realm="HUGO"');
      return res.status(401).send('Auth required');
    }
    next();
  });
}

app.use('/api', routes);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true, isRunning: hugoAgent.isRunning }));

app.listen(PORT, () => {
  console.log(`\n🎯 HUGO Prospector rodando em http://localhost:${PORT}`);
  console.log(`   Nicho: ${process.env.NICHE || 'dermatologista'}`);
  console.log(`   Output: ${process.env.OUTPUT_MODE || 'csv'}`);
  console.log(`   Cron: ${RUN_AT}`);
});

// 3. Cron diário
if (cron.validate(RUN_AT)) {
  cron.schedule(RUN_AT, async () => {
    console.log('[Cron] Disparando HUGO...');
    try { await hugoAgent.execute(); }
    catch (err) { console.error('[Cron] Erro:', err.message); }
  }, { timezone: 'America/Sao_Paulo' });
  console.log(`[Cron] Agendado para "${RUN_AT}" (America/Sao_Paulo)`);
} else {
  console.warn(`[Cron] Expressão inválida em RUN_AT: "${RUN_AT}" — cron desabilitado`);
}

// Graceful shutdown
process.on('SIGINT', () => { console.log('\nShutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nShutting down...'); process.exit(0); });
