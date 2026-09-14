# Deploy na KingHost

Este é o procedimento canônico de deploy do ProxyBembem na KingHost.

## Arquitetura

A aplicação usa dois caminhos de publicação no mesmo domínio:

- **Next.js/Node.js:** código, páginas SSR, APIs, autenticação e checkout rodam em `~/apps_nodejs/proxybembem` pelo `app.js` e pela porta alta fornecida pela KingHost.
- **Nginx/webroot:** CSS, JavaScript gerado pelo Next e arquivos de `public/` precisam estar também em `~/www`, porque a camada pública da KingHost atende esses arquivos pelo webroot antes do processo Node.

O comando `deploy:kinghost` mantém essas duas partes sincronizadas. Ele não apaga nem recria `~/www`; apenas copia os arquivos do projeto e preserva arquivos não relacionados e hashes antigos de `/_next/static`.

## Runtime fixo

- Node.js: `22.1.0`
- pnpm: major `10`
- aplicação KingHost: `proxybembem`
- caminho web: `/`
- entrypoint do painel: `proxybembem/app.js`
- porta: sempre fornecida pela KingHost por variável de ambiente; nunca hard-code uma porta alocada.

Confirme o runtime:

```bash
cd ~/apps_nodejs/proxybembem
nvm use
node -v
```

Esperado:

```text
v22.1.0
```

## Deploy normal

No SSH:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

`deploy:kinghost` executa:

1. build Next.js com webpack;
2. preparação do `.next/standalone`;
3. cópia de `public/*` para `~/www/*`;
4. cópia de `.next/static/*` para `~/www/_next/static/*`.

Depois do comando terminar, reinicie a aplicação **pelo painel da KingHost**, para manter o PM2 gerenciado pelo painel como autoridade do processo.

Não use `pm2 start`, Express, `next dev` ou uma porta hard-coded como procedimento de produção.

**Permissões do shell:** execute build/deploy com o umask normal da sessão (`022`). Não deixe `umask 077` ativo durante o build: em 2026-09-14 isso fez assets recém-gerados de `/_next/static` nascerem em modo `600`, e o nginx respondeu `403` para CSS/JS. O `.env.production` deve continuar privado com permissão restrita própria; não afrouxe o arquivo de segredos para corrigir assets.

## Smoke após deploy

O host canônico direto é `www`; o apex pode redirecionar para ele.

### Página principal

```bash
curl -sSI https://www.proxybembem.com.br/ | head -n 6
```

Esperado: `HTTP/2 200`.

### Arquivo de `public/`

```bash
curl -sSI https://www.proxybembem.com.br/placeholder-logo.png | head -n 6
```

Esperado: `HTTP/2 200` e MIME de imagem.

### CSS do build atual

```bash
CSS=$(curl -fsS https://www.proxybembem.com.br/ | grep -oE '/_next/static/css/[^" ]+\.css' | head -n 1)
echo "$CSS"
curl -sSI "https://www.proxybembem.com.br$CSS" | head -n 8
```

Esperado: `HTTP/2 200` e `content-type: text/css`.

### JavaScript do build atual

```bash
JS=$(curl -fsS https://www.proxybembem.com.br/ | grep -oE '/_next/static/[^" ]+\.js' | head -n 1)
echo "$JS"
curl -sSI "https://www.proxybembem.com.br$JS" | head -n 8
```

Esperado: `HTTP/2 200` e MIME de JavaScript.

## Cron do Melhor Envio

A renovação preventiva do token continua usando:

```text
GET /api/internal/melhor-envio/refresh
```

O endpoint aceita duas formas do mesmo segredo de manutenção:

- `Authorization: Bearer <CRON_SECRET>` para diagnóstico manual controlado;
- `X-CRON-AUTH: <CRON_SECRET>` para o Cronjob da KingHost.

No painel de Cronjob da KingHost, use diretamente o host canônico `www`:

```text
https://www.proxybembem.com.br/api/internal/melhor-envio/refresh
```

Cadência mantida do deployment anterior: todos os dias às **03:17**.

A KingHost fornece o valor de autenticação do header `X_CRON_AUTH`. Configure esse mesmo valor como `CRON_SECRET` no ambiente de produção da aplicação e reinicie a aplicação pelo painel. **Nunca cole esse valor em Git, logs públicos ou chat.**

Uma chamada autorizada retorna somente:

```json
{"ok":true}
```

Falhas de autenticação retornam `401`; falhas de renovação retornam resposta sanitizada sem token ou detalhe do provedor.

## Cron dos e-mails transacionais

A fila de e-mails da Phase 6 é processada pela KingHost usando:

```text
GET /api/internal/notifications/process
```

A rota também aceita POST para diagnóstico manual controlado; GET existe porque o Cronjob HTTP da KingHost chama a URL dessa forma.

O endpoint aceita o mesmo segredo de manutenção existente:

- `Authorization: Bearer <CRON_SECRET>` para diagnóstico manual controlado;
- `X-CRON-AUTH: <CRON_SECRET>` para o Cronjob da KingHost.

No painel de Cronjob da KingHost, use diretamente o host canônico `www`:

```text
https://www.proxybembem.com.br/api/internal/notifications/process
```

Cadência: **a cada 5 minutos**. Cada chamada processa no máximo 25 notificações vencidas e retorna apenas contadores sanitizados; o corpo de e-mail, destinatário e IDs do provedor não são devolvidos pela rota.

A aplicação faz no máximo 3 tentativas por notificação. Erros temporários voltam para a fila com retry após aproximadamente 5 minutos e depois 30 minutos. O mesmo `CRON_SECRET` deve permanecer apenas no ambiente da aplicação e no header protegido do Cronjob.

## Webhook do Resend

O webhook de produção usa diretamente o host canônico `www`:

```text
https://www.proxybembem.com.br/api/webhooks/resend
```

Copie o signing secret do webhook para a variável server-only:

```text
RESEND_WEBHOOK_SECRET=whsec_...
```

O endpoint verifica o corpo bruto com os headers Svix antes de aceitar qualquer evento. Assine somente os eventos operacionais usados pela Phase 6:

- `email.sent`
- `email.delivered`
- `email.bounced`
- `email.failed`
- `email.suppressed`

**Não** assine `email.opened` e **não** assine `email.clicked`; a aplicação não faz rastreamento de abertura nem clique.

Além disso, no Resend abra a configuração do domínio de envio e confirme explicitamente que **Open Tracking = OFF** e **Click Tracking = OFF**. Não basta deixar de assinar os webhooks de abertura/clique: ambos os recursos de tracking do próprio provedor devem permanecer desativados para cumprir a decisão de não rastrear engajamento.

O matching de entrega/falha é feito exclusivamente pelo `email_id` devolvido pelo Resend e já persistido no envio. Se um webhook operacional chegar antes de o worker persistir esse `email_id`, a reconciliação no banco liga o evento à notificação assim que o envio aceito é finalizado; os dois caminhos usam a mesma serialização por ID do provedor para evitar perda de callback e inversão de locks. Webhooks operacionais atrasados também são vinculados ao histórico mesmo quando o estado terminal já é mais forte e não deve ser rebaixado.

O webhook rejeita corpos acima de 64 KiB antes de consultar o signing secret ou persistir eventos, inclusive quando o `Content-Length` está ausente ou subestima o corpo real.

## Arquivos de ambiente

Segredos ficam fora do Git. O `.env.production` no servidor continua privado e deve manter permissões restritas. Para a Phase 6, produção precisa de `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` e do `CRON_SECRET` já existente. Não faça `source .env.production` no shell; valores dotenv podem conter espaços e caracteres que não são sintaxe shell. O Next/runtime lê o arquivo pelo mecanismo de ambiente da aplicação.

## Build de CI vs deploy de servidor

`pnpm build:kinghost` é seguro para CI e só escreve dentro do checkout.

`pnpm deploy:kinghost` é exclusivo do servidor KingHost porque publica em `$HOME/www`. O GitHub Actions nunca deve executar `deploy:kinghost`.

## Rollback operacional

Se um candidato novo falhar, não altere Supabase nem reaplique migrations. Volte o checkout da aplicação para um commit conhecido, execute novamente `deploy:kinghost`, reinicie pelo painel e repita o smoke. Assets antigos com hash são preservados no webroot justamente para evitar uma janela de incompatibilidade durante troca/restart de build.
