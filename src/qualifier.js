/**
 * HUGO Qualifier — atribui score 0-100 e marca leads qualificados
 * Threshold parametrizável via .env (SCORE_THRESHOLD, default 50)
 */
import db from './database.js';

const SCORE_THRESHOLD = parseInt(process.env.SCORE_THRESHOLD || '50', 10);

class Qualifier {
  qualify(runId) {
    const leads = db.prepare(`SELECT * FROM hugo_leads WHERE run_id = ? AND score = 0`).all(runId);
    if (leads.length === 0) return { qualified: 0, total: 0 };

    const update = db.prepare(`UPDATE hugo_leads SET score = ?, score_breakdown = ?, is_qualified = ? WHERE id = ?`);
    let qualified = 0;

    const tx = db.transaction(() => {
      for (const lead of leads) {
        const { score, breakdown } = this.calculateScore(lead);
        const isQualified = score >= SCORE_THRESHOLD ? 1 : 0;
        update.run(score, JSON.stringify(breakdown), isQualified, lead.id);
        if (isQualified) qualified++;
      }
    });
    tx();

    console.log(`[Qualifier] ${qualified}/${leads.length} qualified (score >= ${SCORE_THRESHOLD})`);
    return { qualified, total: leads.length };
  }

  calculateScore(lead) {
    const breakdown = {};
    let score = 0;

    // Contato (max 20)
    if (lead.phone) { score += 10; breakdown.phone = 10; }
    if (lead.email) { score += 5; breakdown.email = 5; }
    if (lead.phone && lead.email) { score += 5; breakdown.both_contacts = 5; }

    // Sinais de negócio (max 30)
    if (lead.has_website) { score += 10; breakdown.website = 10; }
    if (lead.has_team) { score += 10; breakdown.team = 10; }
    if (lead.clinic_name && lead.clinic_name.length > 3) { score += 5; breakdown.clinic_name = 5; }
    if (lead.address && lead.address.length > 5) { score += 5; breakdown.address = 5; }

    // Google Maps (max 15)
    if (lead.google_rating >= 4.5) { score += 10; breakdown.google_high_rating = 10; }
    else if (lead.google_rating >= 4.0) { score += 7; breakdown.google_good_rating = 7; }
    else if (lead.google_rating >= 3.5) { score += 3; breakdown.google_ok_rating = 3; }

    if (lead.google_reviews >= 50) { score += 5; breakdown.google_many_reviews = 5; }
    else if (lead.google_reviews >= 20) { score += 3; breakdown.google_some_reviews = 3; }

    // LinkedIn (max 10)
    if (lead.linkedin_url) { score += 10; breakdown.linkedin = 10; }

    // Instagram (max 15)
    if (lead.instagram) {
      score += 5; breakdown.instagram_present = 5;

      if (lead.instagram_followers >= 5000) { score += 5; breakdown.ig_good_following = 5; }
      else if (lead.instagram_followers >= 1000) { score += 3; breakdown.ig_ok_following = 3; }

      // IG fraco = oportunidade de posicionamento (flag, não pontua)
      if (lead.instagram_followers > 0 && lead.instagram_followers < 1000) {
        breakdown.ig_positioning_opportunity = true;
      }

      if (lead.instagram_posts >= 50) { score += 5; breakdown.ig_active = 5; }
      else if (lead.instagram_posts >= 10) { score += 2; breakdown.ig_somewhat_active = 2; }
    }

    // Especialidade (max 10) — qualquer especialidade conhecida pontua
    if (lead.specialty && lead.specialty.length > 2) {
      score += 5; breakdown.has_specialty = 5;
    }

    return { score: Math.min(score, 100), breakdown };
  }

  getSummary(runId) {
    const total = db.prepare('SELECT COUNT(*) as c FROM hugo_leads WHERE run_id = ?').get(runId)?.c || 0;
    const qualified = db.prepare('SELECT COUNT(*) as c FROM hugo_leads WHERE run_id = ? AND is_qualified = 1').get(runId)?.c || 0;
    const bySource = db.prepare(`
      SELECT source, COUNT(*) as total, SUM(is_qualified) as qualified
      FROM hugo_leads WHERE run_id = ? GROUP BY source
    `).all(runId);
    const bySpecialty = db.prepare(`
      SELECT specialty, COUNT(*) as total, SUM(is_qualified) as qualified
      FROM hugo_leads WHERE run_id = ? AND is_qualified = 1
      GROUP BY specialty ORDER BY qualified DESC
    `).all(runId);
    const byCity = db.prepare(`
      SELECT city, COUNT(*) as total FROM hugo_leads
      WHERE run_id = ? AND is_qualified = 1 AND city != ''
      GROUP BY city ORDER BY total DESC
    `).all(runId);
    const igOpportunities = db.prepare(`
      SELECT COUNT(*) as c FROM hugo_leads
      WHERE run_id = ? AND instagram IS NOT NULL AND instagram != ''
      AND instagram_followers > 0 AND instagram_followers < 1000
    `).get(runId)?.c || 0;
    const avgScore = db.prepare('SELECT AVG(score) as avg FROM hugo_leads WHERE run_id = ?').get(runId)?.avg || 0;

    return { total, qualified, bySource, bySpecialty, byCity, igOpportunities, avgScore: Math.round(avgScore) };
  }
}

export default new Qualifier();
