# ProxyBembem — Phase 7 / Continuidade

**Branch de trabalho:** `feat/phase-7-store-settings`  
**Base inicial:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Criado em:** 2026-09-14  
**Estado:** design e spec aprovados; plano detalhado criado; implementação ainda não iniciada.

Este arquivo é o **handoff vivo obrigatório** desta branch. A finalidade é permitir que qualquer chat novo continue exatamente de onde o anterior parou, sem depender da memória da conversa.

## REGRA PARA TODO CHAT NOVO

Antes de propor, alterar ou implementar qualquer coisa nesta branch:

1. Ler este arquivo inteiro.
2. Ler `docs/PROJECT_MASTER_OVERVIEW.md` para o estado consolidado do projeto.
3. Ler `docs/superpowers/CURRENT_STATUS.md` para o checkpoint operacional curto.
4. Ler `docs/superpowers/specs/2026-09-14-store-settings-design.md`.
5. Ler `docs/superpowers/plans/2026-09-14-store-settings-implementation.md` antes de implementar.
6. Confirmar que o trabalho está em `feat/phase-7-store-settings`, salvo instrução explícita do proprietário.
7. Não reabrir Phases 0–6 sem evidência concreta de regressão ou pedido explícito.
8. Não sobrescrever migrations já aplicadas; qualquer correção de banco nova é aditiva.
9. Implementação deve seguir TDD/RED -> GREEN conforme o plano.
10. Antes de encerrar qualquer sessão com trabalho relevante, **atualizar este `CONTINUIDADE.md`** com o que mudou e o próximo passo exato.

Se houver conflito, a ordem de autoridade é: implementação/estado hospedado atual -> spec aprovada da Phase 7 -> plano da Phase 7 -> `docs/PROJECT_MASTER_OVERVIEW.md` -> `docs/superpowers/CURRENT_STATUS.md` -> este handoff para andamento da branch.

## Baseline herdado

- Phases 0–6 estão integradas na `main`.
- Phase 6 — Transactional Notifications está completa e aceita em Production.
- Merge da Phase 6: `95ac936ca11dfd695734138e579eb97085714980`.
- Base inicial da branch: `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`.
- CI da `main` antes da abertura: #1534 / run `34882211417` — PASS.
- Primeiro CI da branch após o handoff: #1537 / run `34884269185` — PASS.
- Production: KingHost / Node.js **22.1.0**.
- Backend/Auth/PostgreSQL/Storage: Supabase hospedado.
- Pagamento: Mercado Pago.
- Frete/remessas: Melhor Envio.
- E-mail transacional: Resend.

## Objetivo da Phase 7

Implementar Store Settings como um subsistema pequeno, tipado e allowlisted para configurações operacionais/comerciais seguras. Segredos de infraestrutura continuam exclusivamente em ambiente privado e não viram settings.

## Decisões aprovadas

### V1 — exatamente estes campos

- `production_lead_time_business_days`: inteiro 1–15, default 5;
- `contact_email`: contato público opcional;
- `contact_whatsapp_e164`: WhatsApp público opcional em E.164;
- `notice_enabled`: booleano, default false;
- `notice_text`: texto simples opcional, máximo 400 caracteres.

Admin: `/admin/configuracoes`, com item `Configurações` no menu protegido.

### Banco e concorrência

- singleton `public.store_settings` com `id='default'`;
- colunas tipadas, sem key/value e sem JSON irrestrito;
- constraints no banco espelham validação TypeScript;
- migration inicial da Phase 7 planejada: `supabase/migrations/202609140003_store_settings.sql`;
- seed preserva o contato público já existente: `contato@proxybembem.com.br` e `+5544991250332`;
- atualização usa `expectedUpdatedAt`; revisão velha retorna conflito e não sobrescreve;
- migrations novas são sempre aditivas.

### Segurança e auditoria

- RLS habilitado;
- anon/authenticated sem CRUD direto de Store Settings;
- mutação somente pelo backend administrativo;
- same-origin + owner UUID + password + TOTP/AAL2 + sessão admin existente;
- respostas administrativas `private, no-store`;
- update e `admin_audit_log` acontecem atomicamente na mesma RPC/transação;
- audit registra somente valores allowlisted anteriores/novos e actor;
- nenhuma chave/token/segredo de Mercado Pago, Melhor Envio, Supabase, Resend, cron ou KingHost entra no sistema.

### Leitura pública

O browser recebe apenas projeção sanitizada carregada server-side.

Fallback em indisponibilidade:

- prazo: 5 dias úteis;
- aviso: desligado;
- e-mail: ausente;
- WhatsApp: ausente.

Falha de settings não pode derrubar storefront, conta ou checkout. Admin, ao contrário, não pode salvar usando defaults inventados se a leitura autoritativa falhar.

Leitura pública será cacheada por tempo limitado e invalidada após update administrativo bem-sucedido; leitura admin permanece uncached/no-store.

### Consumo público

- FAQ usa prazo configurado dinamicamente;
- WhatsApp hardcoded sai dos pontos compartilhados;
- contato, rodapé, suporte do pedido e fallback do carrinho usam settings;
- ausência de canal não gera `wa.me`/`mailto:` quebrado;
- banner de aviso em texto simples aparece logo abaixo da navbar somente quando ativado;
- banner/storefront compartilhado não aparece em `/admin`;
- conteúdo editorial histórico dentro dos produtos não é reescrito automaticamente.

### Fora de escopo V1

- pause store/checkout;
- preços globais;
- frete manual;
- compra automática de etiqueta;
- controles financeiros;
- secrets de infraestrutura/provedores;
- settings genéricos/arbitrários.

## Invariantes herdados que não podem regredir

- Browser nunca é autoridade para preço, frete, total, ownership, pagamento ou fulfillment.
- `public.products` segue autoridade runtime de catálogo.
- Início do pagamento segue exigindo cliente Supabase autenticado/verificado.
- Mercado Pago segue autoridade financeira.
- Pedidos permanecem privados em `/minha-conta/pedidos/{uuid}`.
- Não restaurar guest checkout, `/pedido/[token]` ou guest claim.
- Admin mantém owner UUID + senha + TOTP/AAL2 + sessão administrativa.
- Lifecycle de produto continua `draft | published | archived`, sem hard delete.
- Melhor Envio continua fail-closed para gasto e compra de etiqueta nunca é automática.
- Preparar/comprar/gerar/imprimir/postar continuam operações diferentes.
- Falha de e-mail não altera pagamento, fulfillment ou shipping.
- Resend Production continua com Open/Click Tracking OFF.
- Segredos, CPF completo e metadados privados não vão para Git/browser/docs.
- Não alterar deploy/permissões/`umask` da KingHost como parte desta fase.

## Fontes canônicas da Phase 7

Spec:

`docs/superpowers/specs/2026-09-14-store-settings-design.md`

Plano:

`docs/superpowers/plans/2026-09-14-store-settings-implementation.md`

Plano criado no commit `31f9f123b8a206e2f30476891b6b2537554ba837`.

O comando do proprietário **“continue”** após a entrega da spec foi tratado como aprovação explícita da spec escrita e autorização para criar o plano.

## Plano de implementação — ordem

1. schema singleton + RPC de update/audit atômico;
2. domínio TypeScript/validação;
3. repository público/admin + fallback/cache;
4. rota administrativa protegida;
5. `/admin/configuracoes` + navegação/form;
6. root shell + FAQ/footer/banner;
7. contato/WhatsApp/carrinho/suporte de pedido;
8. regressão completa + CI + checkpoint docs;
9. migration no Supabase hospedado + advisors;
10. deploy KingHost + smoke + handoff final.

Cada tarefa de código/DDL começa por teste RED e só avança após o failure correto ser observado.

## Estado atual

### Concluído

- branch criada;
- handoff vivo criado e ligado ao `CURRENT_STATUS.md`;
- contexto atual do projeto revisado;
- três partes do design aprovadas pelo proprietário;
- spec formal criada e posteriormente aprovada pelo proprietário;
- plano detalhado TDD criado e auto-revisado para cobertura de banco, domínio, cache, admin, storefront, rollout e Production.

### Ainda não iniciado

- nenhum teste RED da implementação;
- nenhuma migration da Phase 7;
- nenhum código de Store Settings;
- nenhuma alteração de `/admin/configuracoes`/storefront;
- nenhuma aplicação no Supabase hospedado;
- nenhum deploy/smoke KingHost da Phase 7.

## Próximo passo exato

Escolher o modo de execução do plano e iniciar **Task 1 — `store-settings-migration.test.ts` primeiro**, sem criar a migration antes do teste RED.

Opção recomendada: execução subagent-driven, tarefa por tarefa com revisão/verification gates. Alternativa: execução inline/sequencial pelo plano.

Não iniciar Phase 8 ou Phase 9 automaticamente.

## Como manter este arquivo vivo

Após qualquer mudança relevante, atualizar no mínimo:

- estado real concluído/pendente;
- decisões novas aprovadas;
- arquivos/migrations importantes;
- commits e verificações realmente observadas;
- problemas conhecidos/bloqueios;
- próximo passo exato.

Não transformar este arquivo em histórico infinito. Consolidar fatos estáveis nos documentos mestres e manter aqui apenas o necessário para continuar a branch.

## Registro de andamento

### 2026-09-14 — abertura

- branch `feat/phase-7-store-settings` criada a partir de `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`;
- continuidade criada;
- nenhuma implementação iniciada.

### 2026-09-14 — design/spec

- escopo V1, singleton tipado, segurança, auditoria, fallback público, optimistic concurrency e integrações de storefront aprovados;
- spec criada em `docs/superpowers/specs/2026-09-14-store-settings-design.md`;
- proprietário prosseguiu com “continue”, aprovando a spec escrita.

### 2026-09-14 — plano de implementação

- plano TDD criado em `docs/superpowers/plans/2026-09-14-store-settings-implementation.md`;
- implementação continua zerada;
- próxima ação: escolher execução e começar pelo teste RED da migration.
