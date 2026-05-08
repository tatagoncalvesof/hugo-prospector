/**
 * HUGO Migration — schema + seed configurável via .env
 * NICHE e CITIES vêm do .env (não hardcoded).
 */
import db from './database.js';

export function runMigration() {
  console.log('[HUGO Migration] Running...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS hugo_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT DEFAULT 'running',
      sources_used TEXT DEFAULT '[]',
      leads_found INTEGER DEFAULT 0,
      leads_qualified INTEGER DEFAULT 0,
      leads_sent_crm INTEGER DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS hugo_leads (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      source TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      specialty TEXT,
      clinic_name TEXT,
      city TEXT,
      state TEXT,
      address TEXT,
      website TEXT,
      instagram TEXT,
      instagram_followers INTEGER DEFAULT 0,
      instagram_posts INTEGER DEFAULT 0,
      instagram_bio TEXT,
      linkedin_url TEXT,
      google_maps_url TEXT,
      google_rating REAL,
      google_reviews INTEGER DEFAULT 0,
      has_team INTEGER DEFAULT 0,
      has_website INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      score_breakdown TEXT DEFAULT '{}',
      is_qualified INTEGER DEFAULT 0,
      sent_to_crm INTEGER DEFAULT 0,
      crm_lead_id TEXT,
      crm_error TEXT,
      exported_csv INTEGER DEFAULT 0,
      collected_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES hugo_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_hugo_leads_source ON hugo_leads(source);
    CREATE INDEX IF NOT EXISTS idx_hugo_leads_qualified ON hugo_leads(is_qualified);
    CREATE INDEX IF NOT EXISTS idx_hugo_leads_city ON hugo_leads(city);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hugo_leads_dedup ON hugo_leads(phone, email);

    CREATE TABLE IF NOT EXISTS hugo_cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_scraped TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hugo_cities_unique ON hugo_cities(city, state);

    CREATE TABLE IF NOT EXISTS hugo_specialties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      search_terms TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS hugo_reports (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      report_text TEXT,
      sent_at TEXT,
      delivery_status TEXT DEFAULT 'pending',
      FOREIGN KEY (run_id) REFERENCES hugo_runs(id)
    );
  `);

  // Seed cities from .env CITIES (formato: "Curitiba-PR,São Paulo-SP")
  const citiesEnv = (process.env.CITIES || '').trim();
  if (citiesEnv) {
    const insertCity = db.prepare('INSERT OR IGNORE INTO hugo_cities (city, state) VALUES (?, ?)');
    for (const entry of citiesEnv.split(',')) {
      const [city, state] = entry.trim().split('-').map(s => s?.trim());
      if (city && state) insertCity.run(city, state);
    }
  }

  // Seed specialty from .env NICHE
  const niche = (process.env.NICHE || 'dermatologista').trim();
  const insertSpec = db.prepare('INSERT OR IGNORE INTO hugo_specialties (name, search_terms, priority) VALUES (?, ?, ?)');
  // search_terms: variações comuns (singular/plural/qualificador)
  const terms = JSON.stringify([niche, `${niche}s`, `clinica ${niche}`, `${niche} clinica`]);
  insertSpec.run(niche, terms, 10);

  console.log(`[HUGO Migration] Complete — niche="${niche}", cities=${citiesEnv || 'none'}`);
}
