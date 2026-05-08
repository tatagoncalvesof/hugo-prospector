# 🎯 HUGO — Hunter Inteligente de Leads

Agente autônomo que prospecta profissionais (com clínica, escritório ou consultório) via **Google Maps + Instagram + LinkedIn**, qualifica com score 0-100 e exporta em CSV ou envia pra CRM.

**Zero custo de API externa.** Usa Playwright + Chromium pra scraping direto.

---

## ✅ Pra quem é

- Agências, mentorias e consultorias que vendem **pro mesmo nicho** (médicos, dentistas, esteticistas, advogados, contadores, arquitetos, etc.)
- Quem precisa de uma esteira de leads **diária e automatizada** sem pagar Apify/Phantombuster
- Mentoradas Tata que querem prospectar high-ticket de forma sistemática

## 🚫 Pra quem NÃO é

- Quem não sabe rodar comando no terminal (precisa instalar Node + Playwright na VPS)
- Quem precisa de scraping em massa fora dessas 3 fontes (TikTok, Twitter, etc.)

---

## 🚀 Instalação rápida (5 min)

### 1. Pré-requisitos
- Node.js 20+
- VPS Linux (recomendado) ou Mac local pra teste
- ~500MB de espaço (Playwright + Chromium)

### 2. Clone + instala
```bash
git clone <url-do-repo> hugo-prospector
cd hugo-prospector
npm install
npx playwright install chromium
```

### 3. Configura
```bash
cp .env.example .env
nano .env   # ajuste NICHE, CITIES, OUTPUT_MODE
```

**Mínimo necessário no `.env`:**
```bash
NICHE=dermatologista
CITIES=Curitiba-PR,São Paulo-SP
OUTPUT_MODE=csv
```

### 4. Roda
```bash
# Opção A: roda 1 vez agora (pra testar)
npm run run-once

# Opção B: roda servidor com cron + dashboard
npm start
# Dashboard em http://localhost:3920
```

CSVs aparecem em `data/exports/`.

---

## ⚙️ Configuração detalhada

Ver [docs/CONFIG.md](docs/CONFIG.md) — explica cada variável do `.env`, como configurar nichos múltiplos, scoring custom, etc.

## 🌐 Deploy em VPS

Ver [docs/INSTALL.md](docs/INSTALL.md) — guia passo-a-passo PM2 + Nginx + SSL.

## 🔧 Troubleshooting

Ver [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — erros comuns (Chromium não encontrado, Instagram bloqueando, etc.)

---

## 📦 O que vem dentro

```
hugo-prospector/
├── src/
│   ├── index.js          # Entry: Express + cron + dashboard
│   ├── agent.js          # Pipeline: collect → qualify → output
│   ├── collector.js      # Coleta de Google Maps/IG/LinkedIn
│   ├── qualifier.js      # Score 0-100 (7 critérios)
│   ├── scraper.js        # Motor Playwright
│   ├── database.js       # SQLite (data/hugo.db)
│   ├── migration.js      # Schema + seed do .env
│   ├── routes.js         # API REST
│   ├── run-once.js       # Roda 1x e encerra
│   ├── output/
│   │   ├── csv.js        # Default
│   │   └── leadflow.js   # Opcional
│   └── public/index.html # Dashboard
├── data/                 # SQLite + CSVs (gitignored)
└── docs/
```

---

## 🔍 Como Hugo qualifica leads (score 0-100)

| Sinal | Pontos |
|---|---|
| Tem telefone | +10 |
| Tem email | +5 |
| Tem telefone E email | +5 |
| Tem website | +10 |
| Tem time (>20 reviews Google) | +10 |
| Nome de clínica/empresa | +5 |
| Endereço completo | +5 |
| Google Rating ≥4.5 | +10 (ou +7 se ≥4.0) |
| Google Reviews ≥50 | +5 |
| Tem LinkedIn | +10 |
| Tem Instagram | +5 |
| IG ≥5K seguidores | +5 |
| IG ≥50 posts | +5 |
| Especialidade conhecida | +5 |

**Threshold default:** 50. Configurável via `SCORE_THRESHOLD` no `.env`.

**Bônus oportunidade:** leads com IG <1K seguidores são flaggados como **`instagram-fraco`** — oportunidade de oferecer pacote de posicionamento digital pra eles.

---

## 🛡️ Considerações legais

- HUGO usa **scraping de páginas públicas**. Respeita rate-limit (espera entre requests, rotaciona apenas 2 cidades por execução)
- Não burla login wall do Instagram (cai no fallback via Google search)
- LinkedIn só raspa o que aparece no Google (não loga)
- **Você é responsável** por cumprir LGPD ao usar os dados (consentimento, finalidade legítima, base legal de interesse legítimo pra prospecção B2B)

---

## 📄 Licença

Uso interno — não distribuir sem autorização.
