/**
 * HUGO Scraper Engine — Playwright-based, zero external API costs
 * Sources: Google Maps + Instagram + LinkedIn (all via public web)
 */
import { chromium } from 'playwright';

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined; // se vazio, Playwright usa o bundled

class ScraperEngine {
  constructor() {
    this.browser = null;
  }

  async getBrowser() {
    if (this.browser?.isConnected()) return this.browser;

    this.browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
      ],
    });

    console.log('[Scraper] Browser launched');
    return this.browser;
  }

  async newPage() {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', route => route.abort());
    return { page, context };
  }

  async closePage({ page, context }) {
    try { await page?.close(); await context?.close(); } catch (e) { /* ignore */ }
  }

  async close() {
    try {
      await this.browser?.close();
      this.browser = null;
      console.log('[Scraper] Browser closed');
    } catch (e) { /* ignore */ }
  }

  // ── GOOGLE MAPS ──
  async scrapeGoogleMaps(query, maxResults = 20) {
    const { page, context } = await this.newPage();
    const results = [];

    try {
      await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => {});

      const feed = await page.$('[role="feed"]');
      if (feed) {
        for (let i = 0; i < 3; i++) {
          await feed.evaluate(el => el.scrollBy(0, 2000));
          await page.waitForTimeout(1500);
        }
      }

      const links = await page.$$eval('a[href*="/maps/place/"]', els =>
        [...new Set(els.map(el => el.href))].slice(0, 30)
      );

      for (const link of links.slice(0, maxResults)) {
        try {
          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1000);

          const data = await page.evaluate(() => {
            const getText = sel => document.querySelector(sel)?.textContent?.trim() || '';
            const name = getText('h1') || getText('[data-header-feature-id="title"]');

            const ratingText = getText('[role="img"][aria-label*="estrela"]') || getText('[role="img"][aria-label*="star"]');
            const ratingMatch = ratingText.match(/([\d,\.]+)/);
            const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : 0;

            const reviewsText = document.body.innerText.match(/(\d[\d\.]*)\s*(?:avalia[çc][õo]|review)/i);
            const reviews = reviewsText ? parseInt(reviewsText[1].replace('.', '')) : 0;

            const address = document.querySelector('button[data-item-id="address"]')?.textContent?.trim() || '';
            const phone = document.querySelector('button[data-item-id*="phone"]')?.textContent?.trim().replace(/\D/g, '') || '';
            const website = document.querySelector('a[data-item-id="authority"]')?.href || '';
            const category = getText('button[jsaction*="category"]') || '';

            return { name, rating, reviews, address, phone, website, category, url: window.location.href };
          });

          if (data.name) results.push(data);
        } catch (err) { /* skip */ }
      }
    } catch (err) {
      console.error('[Scraper] Google Maps error:', err.message);
    } finally {
      await this.closePage({ page, context });
    }

    console.log(`[Scraper] Google Maps "${query}": ${results.length} results`);
    return results;
  }

  // ── INSTAGRAM ──
  async scrapeInstagramHashtag(hashtag, maxResults = 20) {
    const { page, context } = await this.newPage();
    const results = [];

    try {
      await page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);

      const loginWall = await page.$('input[name="username"]');
      if (loginWall) {
        await this.closePage({ page, context });
        return this.scrapeInstagramViaGoogle(hashtag, maxResults);
      }

      const postLinks = await page.$$eval('a[href*="/p/"]', els =>
        [...new Set(els.map(e => e.href))].slice(0, maxResults)
      );

      for (const link of postLinks.slice(0, maxResults)) {
        try {
          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForTimeout(800);

          const data = await page.evaluate(() => {
            const authorLink = document.querySelector('a[href*="instagram.com/"][role="link"]');
            const author = authorLink?.href?.match(/instagram\.com\/([^/]+)/)?.[1] || '';
            const caption = document.querySelector('meta[property="og:title"]')?.content || '';
            return { author, caption, url: window.location.href };
          });

          if (data.author) results.push(data);
        } catch (e) { /* skip */ }
      }
    } catch (err) {
      console.error('[Scraper] Instagram hashtag error:', err.message);
      return this.scrapeInstagramViaGoogle(hashtag, maxResults);
    } finally {
      await this.closePage({ page, context });
    }

    console.log(`[Scraper] Instagram #${hashtag}: ${results.length} posts`);
    return results;
  }

  async scrapeInstagramViaGoogle(query, maxResults = 15) {
    const { page, context } = await this.newPage();
    const results = [];

    try {
      const searchQuery = `site:instagram.com "${query}" clínica OR consultório OR profissional`;
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=20`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);

      const handles = await page.$$eval('a[href*="instagram.com"]', els =>
        els.map(e => e.href)
          .filter(h => h.includes('instagram.com/') && !h.includes('/p/') && !h.includes('/explore/'))
          .map(h => h.match(/instagram\.com\/([a-zA-Z0-9_.]+)/)?.[1])
          .filter(Boolean)
      );

      for (const handle of [...new Set(handles)].slice(0, maxResults)) {
        results.push({ author: handle, caption: '', url: `https://www.instagram.com/${handle}/` });
      }
    } catch (err) {
      console.error('[Scraper] Instagram via Google error:', err.message);
    } finally {
      await this.closePage({ page, context });
    }

    return results;
  }

  async scrapeInstagramProfile(handle) {
    const { page, context } = await this.newPage();

    try {
      await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);

      const data = await page.evaluate(() => {
        const meta = document.querySelector('meta[property="og:description"]');
        const desc = meta?.content || '';

        const followersMatch = desc.match(/([\d,\.]+[KkMm]?)\s*Followers/i) || desc.match(/([\d,\.]+[KkMm]?)\s*seguidores/i);
        const postsMatch = desc.match(/([\d,\.]+[KkMm]?)\s*Posts/i) || desc.match(/([\d,\.]+[KkMm]?)\s*publicações/i);

        const parseNum = s => {
          if (!s) return 0;
          s = s.replace(/,/g, '');
          if (/[Kk]/.test(s)) return parseFloat(s) * 1000;
          if (/[Mm]/.test(s)) return parseFloat(s) * 1000000;
          return parseInt(s) || 0;
        };

        const bio = desc.split(':').slice(1).join(':').trim().split('"')[0] || '';
        const name = document.querySelector('meta[property="og:title"]')?.content?.replace(/ \(@.*/, '') || '';

        return { name, bio, followers: parseNum(followersMatch?.[1]), posts: parseNum(postsMatch?.[1]) };
      });

      return data;
    } catch (err) {
      return { name: '', bio: '', followers: 0, posts: 0 };
    } finally {
      await this.closePage({ page, context });
    }
  }

  // ── LINKEDIN (via Google) ──
  async scrapeLinkedIn(query, maxResults = 20) {
    const { page, context } = await this.newPage();
    const results = [];

    try {
      const searchQuery = `site:linkedin.com/in/ "${query}" Brasil`;
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=30`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);

      const items = await page.$$eval('.g', els => els.map(el => {
        const link = el.querySelector('a')?.href || '';
        const title = el.querySelector('h3')?.textContent || '';
        const snippet = el.querySelector('.VwiC3b')?.textContent || '';
        return { link, title, snippet };
      }));

      for (const item of items.slice(0, maxResults)) {
        if (!item.link.includes('linkedin.com/in/')) continue;
        const name = item.title.replace(/ - LinkedIn.*/, '').replace(/ \|.*/, '').trim();
        const headline = item.snippet.slice(0, 200);
        results.push({ name, headline, url: item.link });
      }
    } catch (err) {
      console.error('[Scraper] LinkedIn error:', err.message);
    } finally {
      await this.closePage({ page, context });
    }

    console.log(`[Scraper] LinkedIn "${query}": ${results.length} profiles`);
    return results;
  }
}

const scraper = new ScraperEngine();
process.on('SIGINT', () => scraper.close());
process.on('SIGTERM', () => scraper.close());

export default scraper;
