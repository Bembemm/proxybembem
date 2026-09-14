# ProxyBembem Engineering Continuity

## Leia primeiro

A partir da consolidação de 2026-09-14, o ponto de entrada canônico é:

1. `docs/PROJECT_MASTER_OVERVIEW.md`
2. `docs/superpowers/CURRENT_STATUS.md` para evidências operacionais detalhadas acumuladas
3. `docs/superpowers/ADMIN_DASHBOARD_MASTER_PLAN.md` para o roadmap histórico/arquitetural
4. o runbook específico da área que será alterada

A branch canônica de integração agora é `main`. As branches antigas são checkpoints/histórico e não devem ser usadas como base para trabalho novo depois da limpeza.

## Runtime atual

- aplicação: KingHost;
- Node.js: **22.1.0**;
- backend/Auth/banco: Supabase hospedado separadamente;
- pagamentos: Mercado Pago;
- frete/remessas: Melhor Envio;
- e-mails transacionais: Resend;
- deploy: `docs/deployment/kinghost.md`.

## Estado do roadmap

- Phases 0–3: completas/aceitas;
- Phase 4: implementação completa; antigo smoke manual amplo da Stage 3 continua parcialmente pendente;
- Phase 5: completa/owner accepted;
- Phase 6: completa/production accepted e integrada na `main`;
- Phase 7: próxima fase, ainda não iniciada;
- Phases 8–9: não iniciadas.

## Fonte de verdade

Os arquivos em `docs/superpowers/plans/` e `docs/superpowers/specs/` são **histórico**. Checkboxes, branches e próximos passos neles podem estar obsoletos.

Quando houver conflito, use esta ordem:

1. implementação/estado hospedado realmente verificado;
2. `docs/PROJECT_MASTER_OVERVIEW.md`;
3. `CURRENT_STATUS.md`;
4. `ADMIN_DASHBOARD_MASTER_PLAN.md`;
5. planos/specs históricos.

## Invariantes essenciais

- Supabase `public.products` é a única autoridade de catálogo em runtime;
- browser nunca decide preço, frete, total, ownership ou status financeiro;
- pagamento exige cliente autenticado/verificado;
- Mercado Pago permanece autoridade financeira;
- pedidos de cliente são privados em `/minha-conta/pedidos/{uuid}`;
- não restaurar guest checkout, `/pedido/[token]` ou guest claim;
- admin continua owner UUID + senha + TOTP/AAL2 + sessão ativa;
- compra de etiqueta Melhor Envio é explícita e fail-closed;
- migrations já aplicadas não são reaplicadas/regravadas;
- falha de e-mail nunca altera pagamento, fulfillment ou shipping;
- segredos e dados sensíveis não entram em Git/chat/logs públicos.

## Regra para continuar o projeto

Comece uma nova fase a partir da `main` atual, em uma branch curta e específica. Rode CI, faça aceitação necessária, integre explicitamente e atualize `docs/PROJECT_MASTER_OVERVIEW.md` no fechamento da fase.
