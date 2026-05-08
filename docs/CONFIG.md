# ⚙️ Configuração HUGO

Tudo é controlado via `.env`. Aqui é o que cada variável faz.

## Servidor

| Variável | Default | Descrição |
|---|---|---|
| `PORT` | 3920 | Porta HTTP do dashboard |
| `NODE_ENV` | production | `development` mostra logs verbosos |

## Nicho e cidades

| Variável | Exemplo | Descrição |
|---|---|---|
| `NICHE` | `dermatologista` | Profissional-alvo. Vira a especialidade default |
| `CITIES` | `Curitiba-PR,São Paulo-SP` | Lista separada por vírgula. Formato: `Cidade-UF` |

**HUGO rotaciona 2 cidades por execução** — economiza requests e diversifica leads.

### Mudando o nicho

Por **mentorada de mentora high-ticket** (ex: vende pra dermatologistas):
```bash
NICHE=dermatologista
```

Por **agência que vende pra escritórios de advocacia**:
```bash
NICHE=advogado
```

Por **mentora B2B que vende pra contadores**:
```bash
NICHE=contador
```

> **Importante:** o nicho precisa ser uma profissão que apareça no Google Maps com clínica/escritório/consultório. Funciona pra: médicos, dentistas, advogados, contadores, esteticistas, arquitetos, fisioterapeutas, nutricionistas, psicólogos, etc.
> 
> NÃO funciona bem pra: profissionais 100% remotos (designers, devs), profissões sem presença local (influencers).

### Múltiplos nichos

Se quer prospectar múltiplos nichos, use o dashboard (aba "Nichos") pra adicionar mais — eles ficam salvos no banco. Ou edita direto:

```sql
INSERT INTO hugo_specialties (name, search_terms, priority) VALUES
  ('cardiologista', '["cardiologista","cardiologia","clinica cardiologica"]', 9);
```

## Execução

| Variável | Default | Descrição |
|---|---|---|
| `RUN_AT` | `0 7 * * *` | Cron schedule. Default: 7h todo dia |
| `MAX_PER_SOURCE` | 20 | Máximo de leads por fonte por execução |
| `SCORE_THRESHOLD` | 50 | Score mínimo pra qualificar (0-100) |

### Cron schedules úteis

```bash
RUN_AT=0 7 * * *       # 7h todo dia
RUN_AT=0 7,18 * * *    # 7h e 18h todo dia
RUN_AT=0 7 * * 1-5     # 7h só dia útil
RUN_AT=0 9 * * 1       # 9h toda segunda
```

## Output

| Variável | Valores | Descrição |
|---|---|---|
| `OUTPUT_MODE` | `csv`, `leadflow`, `both` | Onde os leads vão parar |

### Modo CSV (default)
Exporta CSV em `data/exports/hugo-leads-YYYY-MM-DD-RUNID.csv` com:
- score, name, phone, email, specialty, clinic_name
- city, state, address, website
- instagram, instagram_followers, linkedin_url
- google_maps_url, google_rating, google_reviews
- source, collected_at

### Modo LeadFlow
Envia leads qualificados pra LeadFlow CRM. Precisa preencher:
```bash
LEADFLOW_URL=https://seu-leadflow.com
LEADFLOW_EMAIL=admin@empresa.com
LEADFLOW_PASSWORD=senha
LEADFLOW_FUNNEL_NAME=Prospecção HUGO
```

HUGO cria o funil automaticamente na 1ª execução com 6 estágios:
Capturado → Enriquecido → Primeiro Contato → Respondeu → Agendou Call → Qualificado

E aplica tags: `hugo-prospeccao`, `high-ticket` (score ≥70), `instagram-fraco` (IG <1K)

### Modo `both`
Faz CSV E LeadFlow ao mesmo tempo.

## Playwright

| Variável | Descrição |
|---|---|
| `CHROMIUM_PATH` | Caminho do Chromium. Linux: `/usr/bin/chromium-browser`. Mac: deixa vazio (usa o bundled do Playwright) |

## Dashboard auth (opcional)

```bash
DASHBOARD_USER=admin
DASHBOARD_PASS=<senha-forte>
```

Se preencher, o dashboard fica protegido por basic auth. Recomendado pra produção.

## Customizando o scoring

Edita `src/qualifier.js` → método `calculateScore`. Score atual:
- Contato: 20 pts max (phone+email)
- Negócio: 30 pts max (website, time, clínica, endereço)
- Google Maps: 15 pts max (rating + reviews)
- LinkedIn: 10 pts
- Instagram: 15 pts
- Especialidade: 5-10 pts

Total: 95 pts (sobra 5 pts livre pra você adicionar critério custom).

## Adicionando critério custom de score

Exemplo: bônus se o lead tem website que termina em `.com.br`:

```js
// em src/qualifier.js, dentro de calculateScore:
if (lead.website?.endsWith('.com.br')) {
  score += 5;
  breakdown.brazilian_domain = 5;
}
```
