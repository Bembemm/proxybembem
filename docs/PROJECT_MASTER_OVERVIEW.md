# ProxyBembem — Visão Geral Mestre do Projeto

**Atualizado em:** 2026-09-15  
**Estado consolidado:** Phases 0–7 concluídas; Phase 8 implementada/hosted validada/candidate deployado com smoke autenticado ainda pendente; Phase 9 em hardening final com repository + hosted Supabase validados e rollout/manual acceptance ainda pendentes.

Este documento é o ponto de entrada canônico para entender o projeto. A realidade hospedada e a implementação atual prevalecem sobre anotações históricas antigas. Planos/specs em `docs/superpowers/plans/` e `docs/superpowers/specs/` preservam o processo histórico de design/TDD e não devem ser lidos como pendências atuais apenas porque contêm passos RED/GREEN antigos.

---

## 1. Baseline atual

### Git / CI

- Branch canônica de integração: `main`.
- Branch ativa: `feat/phase-9-hardening-final-rollout`.
- Phase 6 integrada na `main` via merge `95ac936ca11dfd695734138e579eb97085714980`.
- Phase 7 integrada na `main`; docs closure `75c78437883627e241a9708c8d07a0988dc8c8b5`.
- Runtime Phase 7 aceito: `3fd88688a6cfae343fea3b346a3d1cad1035eb86`.
- Phase 8 rollout candidate: `773504f0e68220c1bda0ec706c4e62f8d542e433`; CI #1631 / run `34960866441` — **PASS**.
- Phase 9 final automated application candidate: `cdb3f863336237ab49f9b91cca20f0d876aa75c7`; CI #1648 / run `34983376962` — **PASS**.
- No merge/rebase/force/delete de branch sem aprovação explícita do proprietário.

### Production / hosted

- Aplicação: KingHost.
- Runtime: Node.js **22.1.0**.
- pnpm operacional: major **10**.
- Backend/Auth/banco: Supabase hospedado separadamente.
- Projeto Supabase: `ProxyBembem`, região `sa-east-1`.
- Phase 7 hosted migration: `20260915002740 store_settings`.
- Phase 8 hosted migration: `20260915092352 dashboard_metrics_attention_center`.
- Phase 9 hosted migration: `20260915145834 phase9_customer_profiles_rls_performance`.
- Phase 8 candidate foi deployado na KingHost; o smoke autenticado `/admin` ainda não foi concluído pelo owner.
- Phase 9 ainda não teve o rollout final nem o smoke manual final.

### Provedores externos

- Mercado Pago: autoridade financeira.
- Melhor Envio: cotação/remessa/etiqueta/rastreamento.
- Resend: e-mails transacionais e recuperação de senha.
- KingHost: runtime Next.js/Node e camada pública nginx/webroot.
- Supabase: Auth, PostgreSQL, Storage, dados operacionais e RPCs.

---

## 2. Arquitetura atual

ProxyBembem é um **monólito modular em Next.js + TypeScript**, com fronteiras server-side para checkout, autenticação, administração, pagamentos, frete, notificações, Store Settings, dashboard administrativo e hardening de acesso/concurrency.

Camadas operacionais:

- **browser/UI:** catálogo, carrinho, formulários, conta do cliente e telas administrativas;
- **Next.js server:** validação, autorização, checkout, integrações, projeções sanitizadas, dashboard protegido e cache público de settings;
- **Supabase:** persistência, Auth, Storage, RLS, RPCs, eventos, auditoria, attention flags e settings;
- **Mercado Pago:** verdade financeira;
- **Melhor Envio:** verdade operacional de remessa/rastreamento;
- **Resend:** transporte/callbacks de e-mail;
- **KingHost:** execução da aplicação e publicação dos assets.

Não existe segunda implementação de backend que deva ser ressuscitada de branches históricas.

---

## 3. Invariantes que não devem regredir

1. Browser nunca é autoridade para preço, subtotal, frete, total, `customer_id`, status financeiro ou ownership.
2. `public.products` no Supabase é a única autoridade de catálogo em runtime.
3. Produto público precisa estar `published`; lifecycle é `draft | published | archived`; sem hard delete administrativo.
4. Iniciar pagamento exige cliente Supabase autenticado e verificado.
5. Ownership de pedido vem de identidade Auth confiável no servidor.
6. Pedidos privados usam `/minha-conta/pedidos/{uuid}`; não restaurar `/pedido/[token]`, guest claim ou guest payment.
7. Mercado Pago é a única autoridade financeira; fulfillment/admin não falsifica pagamento/reembolso.
8. Pedido histórico preserva snapshot de compra/frete.
9. Admin exige owner UUID + senha + TOTP/AAL2 + sessão administrativa server-side ativa; respostas protegidas permanecem no-store.
10. Compra de etiqueta Melhor Envio é explícita e fail-closed; preparar, comprar, gerar, imprimir, postar e cancelar são operações distintas.
11. `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` é o default seguro fora de janela deliberada.
12. Resultado ambíguo de mutação em provider deve ser reconciliado antes de retry.
13. Gerar/imprimir etiqueta/DACE não marca pedido como enviado.
14. Tracking só avança estado com evidência confiável e não regride estado.
15. Notificação transacional nunca muda verdade financeira, fulfillment ou shipping.
16. Resend Open Tracking e Click Tracking permanecem OFF em Production.
17. Segredos, tokens, TOTP, service keys, CPF completo e IDs privados de provider não vão para browser/log público/docs.
18. Migration já aplicada não é reescrita nem reaplicada; correções são aditivas.
19. Store Settings é allowlisted e não contém credenciais/provider secrets.
20. Falha de leitura pública de settings usa fallback seguro server-side; mutação administrativa continua fail-closed.
21. Dashboard/Attention Center são read-only e nunca resolvem flags nem executam mutations de pagamento/pedido/provider.
22. Métricas financeiras usam eventos confiáveis do Mercado Pago; `orders.created_at` não substitui horário de aprovação/reversão.
23. Falha do snapshot administrativo aparece explicitamente; nunca vira zeros sintéticos.
24. Índice não é removido apenas para reduzir advisor INFO; remoção exige prova de redundância e ausência de risco.
25. Reinício KingHost é pelo painel; não usar PM2 CLI.

---

## 4. Fluxos principais

### 4.1 Catálogo e carrinho

- catálogo público resolve apenas produtos `published` do Supabase;
- carrinho pode existir antes do login;
- checkout re-resolve IDs, quantidades, preço e dados físicos no servidor;
- alterações de preço/publicação são reconciliadas contra a autoridade atual.

### 4.2 Checkout e Mercado Pago

- catálogo/carrinho/cotação são públicos;
- `POST /api/checkout` exige identidade verificada antes de reservar/criar pedido;
- servidor persiste pedido e cria preferência com valores autoritativos;
- retorno do navegador nunca é prova de pagamento;
- webhook valida assinatura/provider/referência/valor/moeda e aplica transição atômica;
- preference creation usa lease/idempotency para evitar criação concorrente duplicada.

### 4.3 Conta do cliente

- cadastro/login Supabase;
- e-mail verificado para iniciar pagamento;
- perfil privado e pedidos owner-scoped;
- recuperação de senha usa grant durável com lease/finalização controlados pela aplicação;
- cliente recebe somente projeções sanitizadas dos próprios pedidos/remessas.

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

Autorização depende de owner UUID, senha, TOTP/AAL2 e sessão administrativa ativa. Mutations sensíveis preservam same-origin, rate-limit quando aplicável, bounded body, server authority e `no-store`.

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

Nenhuma etapa anterior à compra pode auto-gastar. Resultado ambíguo de provider entra em attention/reconciliation antes de retry.

### 4.6 Notificações / Resend

Arquitetura: outbox durável no Supabase + worker da aplicação + Resend + webhook Svix assinado.

Tipos suportados:

1. `payment_approved`
2. `production_started`
3. `ready_to_ship`
4. `shipped`
5. `delivered`
6. `canceled`
7. `refunded`
8. `charged_back`

Cada entrega possui dedupe/provider idempotency; reenvio manual cria operação auditável distinta. E-mail nunca altera business truth.

### 4.7 Store Settings

V1 contém exatamente:

- prazo de produção em dias úteis, 1–15;
- e-mail público opcional;
- WhatsApp público opcional em E.164;
- flag de aviso público;
- texto simples de aviso, até 400 caracteres.

Stale revision retorna conflito; browser público recebe somente projeção sanitizada; secrets continuam env-only.

### 4.8 Dashboard Metrics + Attention Center

Contrato Phase 8:

- `public.admin_get_dashboard_snapshot()` captura um único `as_of`;
- Today/Week/Month usam `America/Sao_Paulo`;
- aprovado bruto usa primeiro evento confiável de aprovação do Mercado Pago por pedido;
- reversões usam primeiro `refunded`/`charged_back` confiável por pedido, separadas do aprovado bruto;
- operações e risco financeiro são contagens atuais;
- Attention Center usa flags não resolvidas por pedido, maior severidade e top 5 read-only;
- ranking mensal soma quantities de `orders.items` imutáveis de pedidos aprovados no mês;
- erro backend produz estado de indisponibilidade, sem zeros falsos.

Hosted reconciliation da Phase 8 correspondeu aos dados autoritativos reais.

### 4.9 Hardening Phase 9

A Phase 9 consolidou:

- inventário de rotas sensíveis e boundaries de auth/origin/rate-limit/cache/secrets;
- revisão de privileged RPCs, grants e `search_path`;
- matriz de concorrência/idempotência para pagamento, checkout lease, fulfillment, produtos, Store Settings, shipments, notificações, recovery grants, attention flags e dashboard;
- evidence gate para índices advisor;
- migração performance-only de `customer_profiles` para `(select auth.uid())` sem alteração de ownership;
- checklist manual final que mantém as dívidas Phase 4 e Phase 8 explicitamente pendentes.

---

## 5. Roadmap consolidado

| Fase | Estado | Resultado atual |
| --- | --- | --- |
| 0 — Design + Planning | **COMPLETE** | Arquitetura modular, limites de segurança e estratégia operacional definidos. |
| 1 — Data + Audit Foundation | **COMPLETE / APPLIED** | Fulfillment, eventos, auditoria e attention flags. |
| 2 — Admin Orders + Fulfillment | **COMPLETE / ACCEPTED** | Pedidos/admin/produção e transições protegidas. |
| 3 — Customer Account + Private Orders | **COMPLETE / PRODUCTION ACCEPTED** | Conta verificada, pedidos privados e recuperação de senha. |
| 4 — Catalog + Products Admin + Navigation | **IMPLEMENTATION COMPLETE** | Supabase catalog/admin; smoke manual amplo histórico ainda pendente. |
| 5 — Melhor Envio + Labels + Tracking | **COMPLETE / OWNER ACCEPTED** | OAuth, remessas, compra explícita, geração, DACE, postagem e tracking. |
| 6 — Transactional Notifications | **COMPLETE / PRODUCTION ACCEPTED / IN MAIN** | Outbox, worker, Resend, webhook, admin history e resend auditável. |
| 7 — Store Settings | **COMPLETE / PRODUCTION ACCEPTED / IN MAIN** | Settings allowlisted, admin protegido, projeção pública global e hosted DB validados. |
| 8 — Dashboard Metrics + Attention Center | **IMPLEMENTATION COMPLETE / HOSTED VALIDATED / CANDIDATE DEPLOYED** | Authenticated `/admin` owner smoke ainda pendente. |
| 9 — Hardening + Final Rollout | **IN PROGRESS** | Repository + hosted hardening validados; rollout final/manual acceptance pendentes. |

---

## 6. Banco / migrations por domínio

A série `supabase/migrations/` é a história aditiva do schema. Não reaplicar versões presentes na migration history hospedada.

### Store Settings

- repo: `supabase/migrations/202609140003_store_settings.sql`;
- hosted: `20260915002740 store_settings`.

### Dashboard Metrics + Attention Center

- repo: `supabase/migrations/202609150001_dashboard_metrics_attention_center.sql`;
- hosted: `20260915092352 dashboard_metrics_attention_center`.

### Phase 9 RLS performance hardening

- repo: `supabase/migrations/202609150002_phase9_customer_profiles_rls_performance.sql`;
- hosted: `20260915145834 phase9_customer_profiles_rls_performance`.

A Phase 9 migration recriou somente as três policies próprias de `customer_profiles` usando `(select auth.uid()) = id`, mantendo RLS e ownership semantics. O advisor de performance deixou de reportar os 3 `auth_rls_initplan` warnings.

---

## 7. Supabase advisor baseline após Phase 9

### Performance

Restam 6 INFO `unused_index`:

- `admin_audit_admin_created_idx`
- `shipments_tracking_active_idx`
- `notification_outbox_due_idx`
- `shipment_events_order_created_idx`
- `shipments_sender_profile_id_idx`
- `notification_webhook_events_provider_message_idx`

Todos foram mantidos porque a evidência não provou remoção segura. Não criar migration de drop apenas para silenciar advisor.

### Security

Baseline atual:

- 16 INFO `rls_enabled_no_policy` em tabelas backend-only com browser CRUD revogado;
- 2 WARN de authenticated `SECURITY DEFINER` para `customer_list_orders` e `customer_get_order`, intencionais e owner-scoped por `auth.uid()`;
- leaked-password protection continua disabled.

Supabase documenta leaked-password protection como recurso Pro+. O tooling conectado nesta sessão não expõe Auth-config read/write nem tier do projeto; portanto nenhuma ativação foi fingida/forçada. Estado: `PLATFORM_LIMITATION / OWNER DASHBOARD CHECK`.

---

## 8. Deploy e operação KingHost

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

Para rollout de branch/candidate não integrado, usar detached exact SHA deliberadamente e não reescrever histórico. Depois, restart apenas pelo painel KingHost. Não iniciar/reiniciar PM2 via CLI.

### Incidente `umask`

Em 2026-09-14 um shell com `umask 077` fez assets nascerem `600`, causando 403 do nginx em CSS/JS. Regra: build/deploy com umask normal (`022`).

---

## 9. Verificação / CI

CI verifica Node 22.1.0, frozen install, typecheck, `build:kinghost`, private-order contract, startup adapter smoke e full tests.

Phase 9 automated candidate:

`cdb3f863336237ab49f9b91cca20f0d876aa75c7` — GitHub Actions CI #1648 / run `34983376962`: **PASS**.

O job `verify` passou todas as etapas relevantes. Commits posteriores do branch nesta etapa são documentação/evidência hospedada e não alteraram runtime application code após esse candidate.

---

## 10. Evidência histórica Phase 5 preservada

Phase 5 continua **complete / owner accepted**.

- caminho Production **non-spending / sem gasto** chegou ao carrinho real do Melhor Envio com shipment local em `in_cart`;
- custo observado: **R$ 23,69**;
- `MELHOR_ENVIO_LABEL_PURCHASE_ENABLED=false` continua default seguro fora de janela deliberada;
- Task 18 **owner accepted / owner-reported**;
- Task 19 **complete / concluída**;
- Task 20 **owner accepted / owner-reported**.

Migrations Phase 5:

- `202609080002_melhor_envio_oauth_scope_grants.sql`
- `202609080003_shipments_foundation.sql`
- `202609080004_shipment_operations.sql`
- `202609080005_shipment_cancel_reconciliation.sql`
- `202609080006_customer_shipment_projection.sql`
- `20260909194848_shipments_sender_profile_fk_index.sql`

---

## 11. Aceitação real observada

### Phase 3

Conta/pedidos privados: Production accepted.

### Phase 4

Stage 1/2 aceitas. Stage 3 implementada/automatizada; checklist browser amplo antigo ainda não integralmente refeito.

### Phase 5

OAuth Production, caminho de remessa, compra explícita e smoke final aceitos no nível registrado nos documentos da fase.

### Phase 6

Resend Production, webhook assinado, cron KingHost, entrega real de fixture e reenvio manual auditável aceitos.

### Phase 7

Hosted migration + rollout + global settings propagation aceitos e integrados em `main`.

### Phase 8

- implementação concluída;
- hosted migration aplicada/validada;
- snapshot hospedado reconciliado;
- exact candidate CI-green deployado;
- **authenticated `/admin` owner smoke ainda pendente**.

Não registrar Phase 8 como Production accepted sem esse último gate.

### Phase 9

- repository hardening: validado;
- hosted RLS performance migration: aplicada/validada;
- advisors/grants/reconciliation: validados;
- final automated candidate: CI-green;
- **KingHost final rollout + final manual smoke ainda pendentes**.

---

## 12. Pendências e próxima ação

Pendências antes do fechamento:

1. validar CI do head documental canônico;
2. fazer um único rollout final do exact Phase 9 runtime candidate na KingHost;
3. restart somente pelo painel;
4. confirmar public HTTP health;
5. executar `docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md`;
6. nesse smoke, fechar a dívida Phase 4 product admin e Phase 8 authenticated dashboard;
7. criar `FINAL_ACCEPTANCE.md` apenas após evidência manual real;
8. merge em `main` somente com aprovação explícita do owner.

---

## 13. Documentos de referência

- `docs/PROJECT_MASTER_OVERVIEW.md` — visão geral canônica;
- `docs/deployment/kinghost.md` — deploy/runtime KingHost;
- `docs/payments-setup.md` — Mercado Pago/checkout;
- `docs/shipping-setup.md` — Melhor Envio/remessas;
- `docs/superpowers/CURRENT_STATUS.md` — checkpoint operacional curto;
- `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` — roadmap/decisões;
- `docs/superpowers/phase-8/HOSTED_VALIDATION.md` — hosted evidence Phase 8;
- `docs/superpowers/phase-9/AUDIT_MATRIX.md` — matriz de hardening;
- `docs/superpowers/phase-9/SUPABASE_AUDIT.md` — grants/index/advisor review;
- `docs/superpowers/phase-9/CONCURRENCY_MATRIX.md` — concorrência/idempotência;
- `docs/superpowers/phase-9/HOSTED_VALIDATION.md` — hosted Phase 9 evidence;
- `docs/superpowers/phase-9/FINAL_MANUAL_SMOKE.md` — gates manuais finais;
- `docs/superpowers/plans/` e `docs/superpowers/specs/` — histórico de design/implementação.
