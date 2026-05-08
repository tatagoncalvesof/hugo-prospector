# 🌐 Deploy em VPS

Guia passo-a-passo pra subir HUGO numa VPS Linux com PM2 + Nginx + SSL gratuito.

## 1. Pré-requisitos da VPS

- Ubuntu 22.04+ (qualquer Linux serve, mas comandos abaixo são pra Ubuntu/Debian)
- Acesso SSH como root (ou user com sudo)
- Domínio ou subdomínio apontado pra IP da VPS (ex: `hugo.seudominio.com`)
- ~1GB de RAM disponível (Chromium é pesado)

## 2. Instalar Node 20 + PM2

```bash
# Node 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 (gerenciador de processo)
sudo npm install -g pm2
```

## 3. Instalar Chromium (dependências do sistema)

```bash
sudo apt-get update
sudo apt-get install -y chromium-browser \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
```

## 4. Clonar e configurar HUGO

```bash
sudo mkdir -p /var/www/apps && cd /var/www/apps
sudo git clone <url-do-repo> hugo-prospector
sudo chown -R $USER:$USER hugo-prospector
cd hugo-prospector

npm install --production
npx playwright install chromium

cp .env.example .env
nano .env
```

**Edite `.env` com os valores reais:**
```bash
PORT=3920
NICHE=dermatologista
CITIES=Curitiba-PR,São Paulo-SP,Belo Horizonte-MG
OUTPUT_MODE=csv
CHROMIUM_PATH=/usr/bin/chromium-browser
DASHBOARD_USER=admin
DASHBOARD_PASS=<senha-forte>
```

## 5. Subir com PM2

```bash
pm2 start src/index.js --name hugo-prospector
pm2 save
pm2 startup   # cole o comando que ele imprimir
```

Verifica:
```bash
pm2 logs hugo-prospector --lines 50
```

Deve aparecer: `🎯 HUGO Prospector rodando em http://localhost:3920`

## 6. Nginx + SSL

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Cria `/etc/nginx/sites-available/hugo-prospector`:
```nginx
server {
    listen 80;
    server_name hugo.seudominio.com;

    location / {
        proxy_pass http://localhost:3920;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ativa:
```bash
sudo ln -s /etc/nginx/sites-available/hugo-prospector /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

SSL grátis:
```bash
sudo certbot --nginx -d hugo.seudominio.com
```

Pronto. Acesse `https://hugo.seudominio.com`.

## 7. Comandos úteis

```bash
pm2 status                        # ver processos
pm2 logs hugo-prospector          # logs em tempo real
pm2 restart hugo-prospector       # reiniciar
pm2 stop hugo-prospector          # parar
pm2 delete hugo-prospector        # remover

cd /var/www/apps/hugo-prospector
git pull && npm install --production && pm2 restart hugo-prospector  # update
```

## 8. Backup do banco

```bash
# Cron diário 3h da manhã
0 3 * * * cp /var/www/apps/hugo-prospector/data/hugo.db /var/backups/hugo-$(date +\%Y\%m\%d).db
```
