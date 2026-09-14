# ProxyBembem — Phase 7 / Continuidade

**Branch de trabalho:** `feat/phase-7-store-settings`  
**Base inicial:** `main` @ `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`  
**Criado em:** 2026-09-14  
**Estado:** branch aberta; Phase 7 ainda não foi desenhada nem implementada.

Este arquivo é o **handoff vivo obrigatório** desta branch. A finalidade é permitir que qualquer chat novo continue exatamente de onde o anterior parou, sem depender de memória da conversa.

## REGRA PARA TODO CHAT NOVO

Antes de propor, alterar ou implementar qualquer coisa nesta branch:

1. Ler este arquivo inteiro.
2. Ler `docs/PROJECT_MASTER_OVERVIEW.md` para entender o estado consolidado do projeto.
3. Ler `docs/superpowers/CURRENT_STATUS.md` para o checkpoint operacional curto.
4. Confirmar que o trabalho está acontecendo em `feat/phase-7-store-settings`, salvo instrução explícita do proprietário em contrário.
5. Não reabrir Phases 0–6 sem evidência concreta de regressão ou pedido explícito.
6. Não sobrescrever migrations já aplicadas; mudanças de banco novas devem ser aditivas.
7. Antes de encerrar qualquer sessão que tenha feito trabalho relevante nesta branch, **atualizar este `CONTINUIDADE.md`** com o que mudou e qual é o próximo passo exato.

Se houver conflito entre conversa antiga e o repositório atual, a ordem de autoridade é: implementação/estado hospedado atual -> `docs/PROJECT_MASTER_OVERVIEW.md` -> `docs/superpowers/CURRENT_STATUS.md` -> este handoff para o andamento específico da branch.

## Objetivo principal da branch

A branch foi aberta para a **Phase 7 — Store Settings**. Ela também pode receber correções ou trabalhos incidentais diretamente relacionados ao andamento desta fase, desde que sejam documentados aqui.

O escopo previsto da Phase 7, herdado do master plan, é introduzir configurações operacionais/comerciais tipadas e explicitamente allowlisted. **Segredos de infraestrutura continuam fora do banco/UI e permanecem em variáveis de ambiente.**

Nenhum desenho detalhado da Phase 7 foi aprovado ainda. Portanto, um chat novo não deve assumir schema, telas, campos, RPCs ou fluxo administrativo sem primeiro revisar o contexto e passar pelo processo de design/aprovação.

## Baseline herdado da `main`

- Phases 0–6 estão integradas na `main`.
- Phase 6 — Transactional Notifications está completa e aceita em Production.
- Merge da Phase 6: `95ac936ca11dfd695734138e579eb97085714980`.
- `main` usada para abrir esta branch: `4d9f5a4524dc7ebabd24bcb4a453aa24e783fc66`.
- Último CI conhecido dessa `main` antes da abertura da branch: GitHub Actions #1534 / run `34882211417` — PASS.
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

## Estado atual da Phase 7

**Ainda não iniciada em implementação.**

Até agora foi feito apenas:

- criação da branch `feat/phase-7-store-settings` a partir da `main` consolidada;
- criação deste arquivo de continuidade;
- apontamento em `CURRENT_STATUS.md` para que novos chats leiam este handoff primeiro.

Ainda não existe:

- spec aprovada da Phase 7;
- plano de implementação;
- migration da Phase 7;
- UI de Store Settings;
- RPCs/rotas da Phase 7;
- testes específicos da Phase 7.

## Próximo passo exato

Quando o proprietário quiser começar a Phase 7:

1. Revisar a seção Phase 7 de `docs/PROJECT_MASTER_OVERVIEW.md` e do master plan.
2. Explorar o código atual que poderia consumir configurações de loja.
3. Definir com o proprietário **quais configurações entram na primeira versão** e quais ficam explicitamente fora.
4. Apresentar o design da Phase 7 e obter aprovação antes de implementação.
5. Só depois criar spec/plano/testes/migrations conforme o escopo aprovado.

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
- Nenhuma implementação da Phase 7 iniciada.
- Próxima ação: design da Phase 7 quando o proprietário solicitar.
