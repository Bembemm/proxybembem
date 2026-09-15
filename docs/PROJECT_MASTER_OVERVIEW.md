# ProxyBembem — Visão Geral Mestre do Projeto

**Atualizado em:** 2026-09-14  
**Estado consolidado:** Phases 0–7 concluídas; Phase 6 integrada na `main`; Phase 7 aceita em Production na branch `feat/phase-7-store-settings` e aguardando decisão explícita de integração; Phases 8–9 não iniciadas.

Este documento é o ponto de entrada canônico para entender o projeto. A realidade hospedada e a implementação atual prevalecem sobre anotações históricas antigas. Planos/specs em `docs/superpowers/plans/` e `docs/superpowers/specs/` preservam o processo histórico de design/TDD e não devem ser lidos como pendências atuais apenas porque contêm passos RED/GREEN antigos.

---

## 1. Baseline atual

### Git / CI

- Branch canônica de integração: `main`.
- Phase 6 está integrada na `main` via merge `95ac936ca11dfd695734138e579eb97085714980`.
- Branch concluída da Phase 7: `feat/phase-7-store-settings`.
- Runtime Phase 7 aceito em Production: `db4308296e9f2603e76ded4332394dd58c99a84c`.
- CI desse runtime: GitHub Actions #1589 / run `34918063220` — **PASS**.
- A integração da Phase 7 em `main` ainda depende de decisão explícita do proprietário.

### Production

- Aplicação: KingHost.
- Runtime: Node.js **22.1.0**.
- pnpm operacional: major **10**.
- Backend/Auth/banco: Supabase hospedado separadamente.
- Projeto Supabase: `ProxyBembem`.
- Runtime de aplicação comprovado em Production para a Phase 7: `db4308296e9f2603e76ded4332394dd58c99a84c`.
- Homepage comprovada com **HTTP/2 200** após o deploy.
- Phase 7 hosted migration: `20260915002740 store_settings`.
- O aviso público temporário usado no smoke foi desligado ao final; leitura hospedada confirmou `notice_enabled=false`.

### Provedores externos

- Mercado Pago: autoridade financeira.
- Melhor Envio: cotação/remessa/etiqueta/rastreamento.
- Resend: e-mails transacionais e recuperação de senha.
- KingHost: runtime Next.js/Node e camada pública nginx/webroot.
- Supabase: Auth, PostgreSQL, Storage, dados operacionais e RPCs.

---

## 2. Arquitetura atual

ProxyBembem é um **monólito modular em Next.js + TypeScript**, com fronteiras server-side para checkout, autenticação, administração, pagamentos, frete, notificações e Store Settings.

A aplicação é dividida operacionalmente entre:

- **browser/UI:** catálogo, carrinho, formulários, conta do cliente e telas administrativas;
- **Next.js server:** validação, autorização, checkout, integrações, projeções sanitizadas e cache público de settings;
- **Supabase:** persistência, Auth, Storage, RLS, RPCs, eventos, auditoria e Store Settings;
- **Mercado Pago:** verdade financeira;
- **Melhor Envio:** verdade operacional de remessa/rastreamento;
- **Resend:** transporte/callbacks de e-mail;
- **KingHost:** execução da aplicação e publicação dos assets do build.

Não existe uma segunda implementação de backend que deva ser ressuscitada de branches históricas.

---

## 3. Invariantes que não devem regredir

1. O browser nunca é autoridade para preço, subtotal, frete, total, `customer_id`, status financeiro ou ownership.
2. `public.products` no Supabase é a única autoridade de catálogo em runtime.
3. Produto público precisa estar `published`; lifecycle é exatamente `draft | published | archived`; sem hard delete administrativo.
4. Iniciar pagamento exige cliente Supabase autenticado e verificado.
5. Ownership do pedido vem de identidade Auth confiável no servidor.
6. Pedidos privados usam `/minha-conta/pedidos/{uuid}`; não restaurar `/pedido/[token]`, guest claim ou guest payment.
7. Mercado Pago é a única autoridade financeira; fulfillment/admin não falsifica pagamento/reembolso.
8. Pedido histórico preserva snapshot de compra/frete.
9. Admin exige owner UUID + senha + TOTP/AAL2 + sessão administrativa server-side ativa; respostas protegidas permanecem no-store.
10. Compra de etiqueta Melhor Envio é explícita e fail-closed; preparar, comprar, gerar, imprimir, postar e cancelar são operações distintas.
11. `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` é o default seguro fora de janela deliberada.
12. Resultado ambíguo de mutação em provider deve ser reconciliado antes de retry.
13. Gerar/imprimir etiqueta/DACE não marca pedido como enviado.
14. Tracking só avança estado com evidência confiável e nunca deve regredir estado.
15. Notificação transacional nunca muda verdade financeira, fulfillment ou shipping.
16. Resend Open Tracking e Click Tracking permanecem OFF em Production.
17. Segredos, tokens, TOTP, service keys, CPF completo e IDs privados de provider não vão para browser/log público/docs.
18. Migration já aplicada não é reescrita nem reaplicada; correções são aditivas.
19. Store Settings é allowlisted e não contém credenciais/provider secrets.
20. Falha de leitura pública de settings usa fallback seguro server-side; mutação administrativa continua fail-closed.

---

## 4. Fluxos principais do produto

### 4.1 Catálogo e carrinho

- Catálogo público resolve apenas produtos `published` do Supabase.
- Carrinho pode existir antes do login.
- Alterações de preço/publicação são reconciliadas contra o catálogo atual.
- Checkout re-resolve IDs, quantidades, preço e dados físicos no servidor.

### 4.2 Checkout e Mercado Pago

- Catálogo/carrinho/cotação são públicos.
- `POST /api/checkout` exige identidade verificada antes de reservar/criar pedido.
- O pedido é persistido antes do redirect.
- O servidor cria a preferência a partir de valores autoritativos reconstruídos.
- Retornos voltam para `/minha-conta/pedidos/{order-id}`.
- Webhook valida assinatura, consulta provider, valida referência/valor/moeda e aplica transição atômica.
- Retorno do navegador nunca é prova de pagamento.

### 4.3 Conta do cliente

- Cadastro/login Supabase.
- E-mail verificado para iniciar pagamento.
- Perfil privado e pedidos owner-scoped.
- Recuperação de senha usa grant durável controlado pela aplicação.
- Cliente recebe somente projeções sanitizadas dos próprios pedidos/remessas.

### 4.4 Admin

Principais superfícies:

- `/admin`
- `/admin/pedidos`
- `/admin/pedidos/[id]`
- `/admin/producao`
- `/admin/produtos`
- `/admin/produtos/[id]`
- `/admin/produtos/novo`
- `/admin/integrations/melhor-envio`
- `/admin/configuracoes`

Autorização depende de owner UUID, senha, TOTP/AAL2 e sessão administrativa ativa.

### 4.5 Melhor Envio

Fluxo aceito:

```text
Preparar remessa
  -> revisar serviço/custo
  -> Comprar etiqueta
  -> Gerar etiqueta
  -> imprimir etiqueta/DACE
  -> confirmar postagem
  -> rastrear
```

Production usa o fluxo atual PF/CPF + DC-e/DACE, com fundação para PJ/CNPJ + NF-e. V1 trabalha com um pacote/volume e uma etiqueta por pedido ativo. Nenhuma etapa anterior à compra pode auto-gastar.

### 4.6 E-mail transacional / Resend

Arquitetura: outbox durável no Supabase + worker da aplicação + Resend + webhook Svix assinado.

Tipos exatamente suportados:

1. `payment_approved`
2. `production_started`
3. `ready_to_ship`
4. `shipped`
5. `delivered`
6. `canceled`
7. `refunded`
8. `charged_back`

Nenhum e-mail de pedido é enviado antes de pagamento autoritativamente aprovado. Reenvio manual cria entrega auditável distinta. Callbacks atrasados/antecipados são reconciliados sem rebaixar estado terminal mais forte.

### 4.7 Store Settings

Store Settings V1 contém exatamente:

- prazo de produção em dias úteis, 1–15;
- e-mail público opcional;
- WhatsApp público opcional em E.164;
- flag de aviso público;
- texto simples de aviso, até 400 caracteres.

Admin salva explicitamente em `/admin/configuracoes`; stale revision retorna conflito em vez de sobrescrever valor novo. Browser público recebe somente projeção sanitizada. FAQ, footer, `/contato`, aviso, carrinho e suporte de pedido usam settings sem acesso direto à tabela.

Detalhes da aceitação: `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md`.

---

## 5. Roadmap consolidado

| Fase | Estado | Resultado atual |
| --- | --- | --- |
| 0 — Design + Planning | **COMPLETE** | Arquitetura modular, limites de segurança e estratégia operacional definidos. |
| 1 — Data + Audit Foundation | **COMPLETE / APPLIED** | Fulfillment, eventos, auditoria e attention flags. |
| 2 — Admin Orders + Fulfillment | **COMPLETE / ACCEPTED** | Pedidos/admin/produção e transições protegidas. |
| 3 — Customer Account + Private Orders | **COMPLETE / PRODUCTION ACCEPTED** | Conta verificada, pedidos privados e recuperação de senha. |
| 4 — Catalog + Products Admin + Navigation | **IMPLEMENTATION COMPLETE** | Supabase catalog, admin de produtos e sidebar; smoke manual amplo histórico parcialmente diferido. |
| 5 — Melhor Envio + Labels + Tracking | **COMPLETE / OWNER ACCEPTED** | OAuth, remessas, compra explícita, geração, DACE, postagem e tracking. |
| 6 — Transactional Notifications | **COMPLETE / PRODUCTION ACCEPTED / IN MAIN** | Outbox, worker, Resend, webhook, admin history e resend auditável. |
| 7 — Store Settings | **COMPLETE / PRODUCTION ACCEPTED** | Settings allowlisted, admin protegido, projeção pública, hosted DB e smoke final aceitos. |
| 8 — Dashboard Metrics + Attention Center | **NOT STARTED** | Métricas/filas operacionais confiáveis. |
| 9 — Hardening + Final Rollout | **NOT STARTED** | Revisão final de auth, isolation, origins, rate limit, secrets, concorrência e smoke. |

---

## 6. Banco / migrations por domínio

A série `supabase/migrations/` é a história aditiva do schema. Não reaplicar versões presentes na migration history hospedada.

### Pedidos, pagamento e checkout

Foundation de pedidos, hardening de checkout/frete, eventos financeiros atômicos, lease de preferência e dados fiscais/recipient necessários ao fluxo atual.

### Admin e contas

Sessões administrativas, operações/auditoria de pedidos, fulfillment, contas/pedidos privados e recuperação de senha durável.

### Catálogo

`product_catalog`, grants server-side e hardening de least privilege.

### Melhor Envio / remessas

OAuth/scopes, `shipments`, `shipment_events`, sender profiles, operações, cancelamento/reconciliação, customer projection e índices relacionados.

### Notificações

Migrations Phase 6 incluem foundation, triggers, advisory indexes, webhook reconciliation e hardening/backfill finais.

### Store Settings

- repo: `supabase/migrations/202609140003_store_settings.sql`;
- hosted: `20260915002740 store_settings`.

Essa migration já foi aplicada/validada e não deve ser reaplicada.

---

## 7. Deploy e operação KingHost

Runbook: `docs/deployment/kinghost.md`.

Estrutura:

- aplicação Node/Next: `~/apps_nodejs/proxybembem`;
- assets públicos/Next: `~/www`;
- entrypoint: `proxybembem/app.js`;
- porta vem do ambiente KingHost; não hard-code.

Deploy normal:

```bash
cd ~/apps_nodejs/proxybembem
git pull --ff-only
nvm use
npx pnpm@10 install --frozen-lockfile
NODE_ENV=production npx pnpm@10 deploy:kinghost
```

Depois, restart pelo painel KingHost. Não iniciar PM2 manualmente.

### Incidente `umask`

Em 2026-09-14 um shell com `umask 077` fez assets nascerem `600`, causando 403 do nginx em CSS/JS. Regra operacional: build/deploy com umask normal (`022`); não afrouxar `.env.production` e não alterar o deploy para mascarar um shell configurado incorretamente.

---

## 8. Verificação / CI

CI valida runtime exato Node 22.1.0, install com lockfile congelado, typecheck, KingHost build, private-order contract, startup adapter/smoke e suíte automatizada.

Para a Phase 7, o runtime final aceito `db430829...` passou GitHub Actions #1589 / run `34918063220`.

A regressão final cobre explicitamente o banner público abaixo da navbar fixa.

---

## 9. Aceitação real observada

### Phase 3

Conta/pedidos privados: Production accepted.

### Phase 4

Stage 1/2 aceitas em Production. Stage 3 implementada/automatizada; checklist browser amplo antigo não integralmente refeito.

### Phase 5

OAuth Production, caminho de remessa, compra explícita e smoke final aceitos no nível registrado nos documentos da fase.

### Phase 6

Resend Production, webhook assinado, cron KingHost, entrega real de fixture e reenvio manual auditável aceitos.

### Phase 7

- hosted migration aplicada/validada;
- deploy KingHost do candidate `db430829...`;
- homepage 200;
- aviso temporário presente no HTML quando habilitado;
- bug de posição do banner encontrado e corrigido;
- screenshot do proprietário confirmou banner abaixo da navbar;
- stale two-tab save foi recusado no admin;
- aviso temporário desligado ao final.

---

## 10. Pendências e riscos conhecidos

Estes itens são backlog/hardening e não reabrem automaticamente as fases aceitas:

1. Antigo browser smoke amplo da Phase 4 não foi integralmente refeito.
2. Observação manual do header no-store autenticado não foi registrada no último smoke, embora haja regressão automatizada.
3. Supabase Auth leaked-password protection está desabilitado; avaliar na Phase 9.
4. `customer_profiles` possui findings `auth_rls_initplan` de performance.
5. Índices unused são informativos no volume atual; não remover sem evidência.
6. RLS sem policy em tabelas backend-only é intencional quando browser CRUD está revogado.
7. Não repetir deploy/build com `umask 077` ativo.
8. Branches históricas não devem ser usadas como base de trabalho novo quando a `main`/branch ativa já as superou.

---

## 11. Próxima ação

A Phase 7 está completa e Production accepted, porém **ainda não integrada na `main`**.

Próximo passo: decisão explícita do proprietário sobre `feat/phase-7-store-settings` — merge, PR/revisão ou manutenção da branch.

Não iniciar Phase 8 ou Phase 9 automaticamente.

---

## 12. Documentos de referência

- `docs/PROJECT_MASTER_OVERVIEW.md` — visão geral canônica;
- `docs/deployment/kinghost.md` — deploy/runtime KingHost;
- `docs/payments-setup.md` — Mercado Pago/checkout;
- `docs/shipping-setup.md` — Melhor Envio/remessas;
- `docs/superpowers/CURRENT_STATUS.md` — checkpoint operacional curto;
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` — roadmap/decisões;
- `docs/superpowers/phase-7/CONTINUIDADE.md` — handoff Phase 7;
- `docs/superpowers/phase-7/FINAL_ACCEPTANCE.md` — evidência final Phase 7;
- `docs/superpowers/plans/` e `docs/superpowers/specs/` — histórico de implementação/design.
