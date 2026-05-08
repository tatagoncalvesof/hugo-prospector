# 🔧 Troubleshooting

## "Cannot find module '/usr/bin/chromium-browser'"

Chromium não está instalado ou em caminho diferente.

**Solução Linux:**
```bash
which chromium-browser    # ver caminho
# se vazio:
sudo apt-get install -y chromium-browser
```

Depois ajusta `.env`:
```bash
CHROMIUM_PATH=/usr/bin/chromium-browser
```

**Solução Mac:** deixa `CHROMIUM_PATH=` vazio. Playwright usa o bundled.

## "browserType.launch: Failed to launch chromium"

Faltam libs do sistema (Linux).

```bash
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
```

## "Instagram login wall — using alternative method"

Normal. Instagram bloqueia scraping anônimo de hashtags. HUGO automaticamente faz fallback via Google search (`site:instagram.com`).

Não é bug — só significa que IG dessa vez veio menos rico.

## "no leads found" mesmo com cidades configuradas

1. Confere que `CITIES` tá no formato certo: `Cidade-UF` separado por vírgula
2. Confere que `NICHE` faz sentido pra Google Maps:
   - ✅ `dermatologista`, `dentista`, `advogado`
   - ❌ `dermato` (curto demais), `coach` (sem clínica)
3. Roda manualmente e olha logs:
   ```bash
   npm run run-once
   ```
4. Se Google Maps retorna 0, pode ser bloqueio temporário de IP. Espera 1-2h.

## "VPS travada / OOM Killer"

Chromium come RAM. Em VPS de 1GB, pode estourar.

**Soluções:**
1. **Limita PM2:** `pm2 start src/index.js --name hugo --max-memory-restart 700M`
2. **Reduz `MAX_PER_SOURCE`** no `.env`: `MAX_PER_SOURCE=10`
3. **Upgrade VPS** pra 2GB+

## "LeadFlow auth failed: 401"

Credenciais erradas no `.env`. Confere:
```bash
LEADFLOW_URL=https://seu-leadflow.com   # SEM barra no final
LEADFLOW_EMAIL=email@correto.com
LEADFLOW_PASSWORD=senha-correta
```

Testa manualmente:
```bash
curl -X POST https://seu-leadflow.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}'
```

## Banco corrompido

```bash
# Backup primeiro
cp data/hugo.db data/hugo.db.backup

# Reseta (perde tudo)
rm data/hugo.db data/hugo.db-journal
npm start   # recria
```

## Dashboard mostra dados antigos

Cache do navegador. Hard refresh: `Cmd+Shift+R` (Mac) ou `Ctrl+Shift+R` (Windows/Linux).

## Logs muito verbosos / quero menos ruído

Reduz log do Playwright:
```bash
DEBUG= npm start
```

Ou redireciona pro arquivo:
```bash
pm2 start src/index.js --name hugo -o /var/log/hugo.log -e /var/log/hugo-err.log
```

## Como testar sem rodar pipeline completa

Usa `run-once` com `MAX_PER_SOURCE=2`:

```bash
MAX_PER_SOURCE=2 npm run run-once
```

Roda só 2 leads por fonte (~30s ao invés de 5-10min).
