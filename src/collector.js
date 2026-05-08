/**
 * HUGO Collector — coleta leads via Google Maps + Instagram + LinkedIn
 * Nicho parametrizável via .env (NICHE)
 */
import crypto from 'crypto';
import db from './database.js';
import scraper from './scraper.js';

const NICHE = (process.env.NICHE || 'dermatologista').trim();
const MAX_PER_SOURCE = parseInt(process.env.MAX_PER_SOURCE || '20', 10);

class Collector {
  constructor() {
    this.stats = { found: 0, errors: [] };
  }

  saveLead(runId, data) {
    const id = `hugo-${crypto.randomUUID()}`;
    const phone = (data.phone || '').replace(/\D/g, '') || null;
    const email = (data.email || '').toLowerCase().trim() || null;

    if (!phone && !email && !data.instagram) return null;

    if (phone || email) {
      const existing = db.prepare(`
        SELECT id FROM hugo_leads WHERE (phone IS NOT NULL AND phone = ?) OR (email IS NOT NULL AND email = ?)
      `).get(phone || '__none__', email || '__none__');
      if (existing) return null;
    }

    try {
      db.prepare(`
        INSERT INTO hugo_leads (id, run_id, source, name, email, phone, specialty, clinic_name,
          city, state, address, website, instagram, instagram_followers, instagram_posts, instagram_bio,
          linkedin_url, google_maps_url, google_rating, google_reviews, has_team, has_website)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, runId, data.source || 'unknown',
        data.name || '', email, phone,
        data.specialty || NICHE, data.clinic_name || '',
        data.city || '', data.state || '', data.address || '',
        data.website || '', data.instagram || '',
        data.instagram_followers || 0, data.instagram_posts || 0, data.instagram_bio || '',
        data.linkedin_url || '', data.google_maps_url || '',
        data.google_rating || 0, data.google_reviews || 0,
        data.has_team ? 1 : 0, data.has_website ? 1 : 0
      );
      this.stats.found++;
      return id;
    } catch (err) {
      if (err.message.includes('UNIQUE')) return null;
      throw err;
    }
  }

  async collectAll(runId) {
    this.stats = { found: 0, errors: [] };
    const sources = [];

    const cities = db.prepare('SELECT * FROM hugo_cities WHERE is_active = 1').all();
    const specialties = db.prepare('SELECT * FROM hugo_specialties WHERE is_active = 1 ORDER BY priority DESC').all();

    if (cities.length === 0 || specialties.length === 0) {
      console.warn('[Collector] No cities or specialties configured. Check .env CITIES and NICHE');
      return { sources, found: 0, errors: this.stats.errors };
    }

    // Rotaciona 2 cidades por execução
    const runCount = db.prepare('SELECT COUNT(*) as c FROM hugo_runs').get()?.c || 0;
    const cityPair = [
      cities[runCount % cities.length],
      cities[(runCount + 1) % cities.length],
    ].filter(Boolean);

    const topSpecs = specialties.slice(0, 3);

    try {
      const count = await this.collectGoogleMaps(runId, cityPair, topSpecs);
      if (count > 0) sources.push('google_maps');
    } catch (err) { this.stats.errors.push({ source: 'google_maps', error: err.message }); }

    try {
      const count = await this.collectInstagram(runId, topSpecs);
      if (count > 0) sources.push('instagram');
    } catch (err) { this.stats.errors.push({ source: 'instagram', error: err.message }); }

    try {
      const count = await this.collectLinkedIn(runId, topSpecs);
      if (count > 0) sources.push('linkedin');
    } catch (err) { this.stats.errors.push({ source: 'linkedin', error: err.message }); }

    const updateCity = db.prepare("UPDATE hugo_cities SET last_scraped = datetime('now') WHERE id = ?");
    for (const city of cityPair) updateCity.run(city.id);

    await scraper.close();

    return { sources, found: this.stats.found, errors: this.stats.errors };
  }

  async collectGoogleMaps(runId, cities, specialties) {
    let count = 0;

    for (const city of cities) {
      for (const spec of specialties.slice(0, 2)) {
        const query = `${spec.name} ${city.city} ${city.state}`;
        const items = await scraper.scrapeGoogleMaps(query, MAX_PER_SOURCE);

        for (const item of items) {
          const saved = this.saveLead(runId, {
            source: 'google_maps',
            name: item.name,
            phone: item.phone,
            specialty: spec.name,
            clinic_name: item.name,
            city: city.city,
            state: city.state,
            address: item.address,
            website: item.website,
            google_maps_url: item.url,
            google_rating: item.rating,
            google_reviews: item.reviews,
            has_team: item.reviews > 20,
            has_website: (item.website || '').length > 5,
          });
          if (saved) count++;
        }
      }
    }

    console.log(`[Collector] Google Maps: ${count} leads`);
    return count;
  }

  async collectInstagram(runId, specialties) {
    let count = 0;
    const hashtags = [];
    for (const spec of specialties.slice(0, 2)) {
      const terms = JSON.parse(spec.search_terms || '[]');
      // pega os primeiros 2 termos (sem espaço) como hashtag
      for (const t of terms.slice(0, 2)) {
        const tag = t.replace(/\s+/g, '').toLowerCase();
        if (tag) hashtags.push(tag);
      }
    }

    for (const tag of [...new Set(hashtags)].slice(0, 2)) {
      const posts = await scraper.scrapeInstagramHashtag(tag, Math.ceil(MAX_PER_SOURCE / 2));
      const seenProfiles = new Set();

      for (const post of posts) {
        if (!post.author || seenProfiles.has(post.author)) continue;
        seenProfiles.add(post.author);

        const profile = await scraper.scrapeInstagramProfile(post.author);
        const bioLower = (profile.bio || '').toLowerCase();

        // Verifica se bio tem algum termo do nicho (relaxa "isMedical" pra ser nicho-genérico)
        const allTerms = specialties.flatMap(s => JSON.parse(s.search_terms || '[]')).map(t => t.toLowerCase());
        const matchesNiche = allTerms.some(t => bioLower.includes(t));
        if (!matchesNiche && profile.bio) continue;

        let detectedSpec = '';
        for (const spec of specialties) {
          const terms = JSON.parse(spec.search_terms || '[]');
          if (terms.some(t => bioLower.includes(t.toLowerCase()))) {
            detectedSpec = spec.name; break;
          }
        }

        const saved = this.saveLead(runId, {
          source: 'instagram',
          name: profile.name || post.author,
          instagram: post.author,
          instagram_followers: profile.followers,
          instagram_posts: profile.posts,
          instagram_bio: (profile.bio || '').slice(0, 500),
          specialty: detectedSpec || NICHE,
        });
        if (saved) count++;
      }
    }

    console.log(`[Collector] Instagram: ${count} leads`);
    return count;
  }

  async collectLinkedIn(runId, specialties) {
    let count = 0;

    for (const spec of specialties.slice(0, 2)) {
      const results = await scraper.scrapeLinkedIn(`${spec.name} clínica`, Math.ceil(MAX_PER_SOURCE / 2));

      for (const item of results) {
        const saved = this.saveLead(runId, {
          source: 'linkedin',
          name: item.name,
          specialty: spec.name,
          clinic_name: item.headline || '',
          linkedin_url: item.url,
        });
        if (saved) count++;
      }
    }

    console.log(`[Collector] LinkedIn: ${count} leads`);
    return count;
  }
}

export default new Collector();
