# ProxyBembem — Phase 7 / Continuidade

**Branch de trabalho:** `feat/phase-7-store-settings`  
**Base inicial:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Criado em:** 2026-09-14  
**Estado:** design aprovado em chat; spec escrita criada; implementação ainda não iniciada.

Este arquivo é o **handoff vivo obrigatório** desta branch. A finalidade é permitir que qualquer chat novo continue exatamente de onde o anterior parou, sem depender de memória da conversa.

## REGRA PARA TODO CHAT NOVO

Antes de propor, alterar ou implementar qualquer coisa nesta branch:

1. Ler este arquivo inteiro.
2. Ler `docs/PROJECT_MASTER_OVERVIEW.md` para entender o estado consolidado do projeto.
3. Ler `docs/superpowers/CURRENT_STATUS.md` para o checkpoint operacional curto.
4. Ler `docs/superpowers/specs/2026-09-14-store-settings-design.md` antes de trabalhar na Phase 7.
5. Confirmar que o trabalho está acontecendo em `feat/phase-7-store-settings`, salvo instrução explícita do proprietário em contrário.
6. Não reabrir Phases 0–6 sem evidência concreta de regressão ou pedido explícito.
7. Não sobrescrever migrations já aplicadas; mudanças de banco novas devem ser aditivas.
8. Antes de encerrar qualquer sessão que tenha feito trabalho relevante nesta branch, **atualizar este `CONTINUIDADE.md`** com o que mudou e qual é o próximo passo exato.

Se houver conflito entre conversa antiga e o repositório atual, a ordem de autoridade é: implementação/estado hospedado atual -> spec escrita aprovada da Phase 7 -> `docs/PROJECT_MASTER_OVERVIEW.md` -> `docs/superpowers/CURRENT_STATUS.md` -> este handoff para o andamento específico da branch.

## Objetivo principal da branch

Implementar a **Phase 7 — Store Settings** como um subsistema pequeno, tipado e allowlisted para configurações operacionais/comerciais seguras.

Segredos de infraestrutura continuam fora do banco/UI e permanecem em variáveis de ambiente.

## Baseline herdado da `main`

- Phases 0–6 estão integradas na `main`.
- Phase 6 — Transactional Notifications está completa e aceita em Production.
- Merge da Phase 6: `95ac936ca11dfd695734138e579eb97085714980`.
- `main` usada para abrir esta branch: `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`.
- Último CI conhecido dessa `main` antes da abertura da branch: GitHub Actions #1534 / run `34882211417` — PASS.
- Primeiro CI da branch após criar o handoff: GitHub Actions #1537 / run `34884269185` — PASS.
- Runtime de Production: KingHost, Node.js **22.1.0**.
- Backend/Auth/PostgreSQL/Storage: Supabase hospedado.
- Pagamentos: Mercado Pago.
- Frete/remessas: Melhor Envio.
- E-mail transacional: Resend.

## Invariantes que esta branch deve preservar

- Browser não é autoridade para preço, frete, total, ownership, pagamento ou fulfillment.
- `public.products` continua sendo a autoridade runtime de catálogo.
- Início do pagamento exige cliente Supabase autenticado/verificado.
- Mercado Pago continua sendo a autoridade financeira.
- Pedidos de cliente permanecem privados em `/minha-conta/pedidos/{uuid}`.
- Não restaurar guest checkout, `/pedido/[token]` ou guest claim.
- Admin continua exigindo owner UUID + senha + TOTP/AAL2 + sessão administrativa ativa.
- Lifecycle de produto permanece `draft | published | archived`, sem hard delete.
- Melhor Envio permanece fail-closed para gasto; compra de etiqueta nunca deve ocorrer automaticamente.
- Preparar, comprar, gerar, imprimir e postar remessa continuam operações distintas.
- Falha de e-mail nunca altera pagamento, fulfillment ou shipping.
- Resend Production permanece com Open Tracking OFF e Click Tracking OFF.
- Segredos, chaves, tokens, CPF completo e metadados privados de provedores não devem ir para Git, browser ou documentação.

## Decisões aprovadas da Phase 7

### Escopo V1

Entram exatamente estes settings:

- `production_lead_time_business_days` — inteiro de 1 a 15, default 5;
- `contact_email` — contato público opcional;
- `contact_whatsapp_e164` — WhatsApp público opcional, canônico;
- `notice_enabled` — booleano, default false;
- `notice_text` — aviso público curto em texto simples.

A nova tela administrativa será `/admin/configuracoes`, com item `Configurações` no menu protegido.

### Modelo de dados

- tabela singleton `store_settings`;
- colunas tipadas, não tabela genérica `key/value` e não JSON irrestrito;
- constraints no banco espelhando validação TypeScript;
- update com `expectedUpdatedAt` para proteção contra sobrescrita entre abas;
- migrations novas sempre aditivas.

### Segurança

- RLS habilitado;
- browser comum sem CRUD direto;
- mutação somente pelo backend administrativo protegido;
- same-origin + admin auth/AAL2/sessão existente;
- resposta admin `private, no-store`;
- nenhuma chave/token/segredo de Mercado Pago, Melhor Envio, Supabase, Resend, cron ou KingHost vira store setting.

### Auditoria

A alteração dos settings deve ser auditada atomicamente com a própria atualização, preferencialmente via RPC backend-only que atualiza `store_settings` e escreve no `admin_audit_log` na mesma transação.

Auditar somente valores allowlisted anteriores/novos e admin actor, sem segredos.

### Leitura pública e fallback

O site recebe somente uma projeção sanitizada server-side.

Fallback público em indisponibilidade:

- prazo = 5 dias úteis;
- aviso desligado;
- e-mail ausente;
- WhatsApp ausente.

Admin não salva a partir de defaults inventados quando o backend estiver indisponível.

### Consumo no storefront

- FAQ deixa de ter prazo global hardcoded e passa a usar o setting;
- WhatsApp hardcoded é removido dos pontos compartilhados e os helpers passam a receber destino configurado;
- contato/rodapé/suporte de pedido/fallback do carrinho usam a projeção pública quando aplicável;
- ausência de contato não pode gerar `wa.me`/`mailto:` quebrado;
- aviso da loja aparece como banner de texto simples logo abaixo da navbar quando explicitamente ativado;
- banner não aparece no admin;
- textos históricos/editoriais já salvos dentro de produtos não são reescritos silenciosamente.

### Fora de escopo V1

- pause store/checkout;
- preços globais;
- frete manual;
- compra automática de etiqueta;
- configurações financeiras;
- infraestrutura/provedor secrets;
- settings arbitrários/genéricos.

## Spec canônica da Phase 7

Criada em:

`docs/superpowers/specs/2026-09-14-store-settings-design.md`

Status atual: design aprovado em chat e spec escrita criada; falta a revisão final explícita do proprietário sobre o documento antes de criar o plano de implementação.

## Estado atual da Phase 7

Concluído:

- branch criada;
- `CONTINUIDADE.md` criado e referenciado por `CURRENT_STATUS.md`;
- contexto do código atual revisado;
- escopo V1 aprovado;
- modelo de banco/segurança/auditoria aprovado;
- consumo no admin/storefront aprovado;
- spec formal escrita e commitada.

Ainda não iniciado:

- plano de implementação;
- migrations da Phase 7;
- testes específicos da Phase 7;
- repositório/helper de settings;
- RPC de update;
- `/admin/configuracoes`;
- alteração de FAQ/WhatsApp/contato/banner;
- aplicação no Supabase hospedado;
- deploy/smoke KingHost.

## Próximo passo exato

1. Proprietário revisar/aprovar explicitamente `docs/superpowers/specs/2026-09-14-store-settings-design.md`.
2. Após essa aprovação, criar o plano detalhado de implementação em `docs/superpowers/plans/` usando TDD e commits pequenos.
3. Só depois iniciar código/migrations/testes.

Não começar Phase 8 ou Phase 9 automaticamente.

## Como manter este arquivo vivo

Após qualquer mudança relevante nesta branch, atualizar no mínimo:

- **Estado atual** — o que já está concluído e o que ainda está pendente.
- **Decisões aprovadas** — decisões de arquitetura, produto ou segurança que futuros chats precisam respeitar.
- **Arquivos/migrations importantes** — nomes e finalidade.
- **Verificações** — CI/testes/smokes realmente observados, sem inventar evidência.
- **Problemas conhecidos** — bugs, riscos, débitos e bloqueios.
- **Próximo passo exato** — uma ação concreta para o próximo chat.

Não transformar este arquivo em histórico infinito. Quando algo estiver consolidado no documento mestre, manter aqui apenas o resumo necessário para continuidade e apontar para a fonte canônica.

## Registro de andamento

### 2026-09-14 — abertura da Phase 7

- Branch criada: `feat/phase-7-store-settings`.
- Base: `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`.
- Nenhuma implementação iniciada.

### 2026-09-14 — design da Phase 7 aprovado

- Escopo V1 aprovado pelo proprietário.
- Arquitetura singleton tipada aprovada.
- Segurança, auditoria, fallback público e optimistic concurrency aprovados.
- Integração com FAQ/contatos/WhatsApp/banner aprovada.
- Spec escrita criada em `docs/superpowers/specs/2026-09-14-store-settings-design.md`.
- Próxima ação: revisão final explícita da spec e, se aprovada, criação do plano de implementação.
