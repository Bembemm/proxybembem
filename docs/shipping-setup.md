# Configuração de frete com Melhor Envio

A integração do ProxyBembem com o Melhor Envio tem um escopo deliberadamente pequeno:

```text
cotação no checkout
  -> preparar remessa no admin
  -> adicionar ao carrinho do Melhor Envio
  -> comprar / gerar / imprimir diretamente no Melhor Envio
  -> voltar ao ProxyBembem e marcar o pedido como enviado
```

O ProxyBembem **não compra etiquetas**, não gera etiquetas, não imprime etiqueta/DACE, não cancela etiquetas e não sincroniza rastreamento pela API do Melhor Envio.

## API utilizada

A cotação usa:

```text
POST /api/v2/me/shipment/calculate
```

A preparação usa:

```text
POST /api/v2/me/cart
```

Depois que a remessa é adicionada ao carrinho, toda operação financeira e documental é feita diretamente no site do Melhor Envio.

Bases:

```text
Sandbox:    https://sandbox.melhorenvio.com.br
Production: https://melhorenvio.com.br
```

## OAuth mínimo

Novas autorizações solicitam somente:

```text
shipping-calculate
cart-write
```

Scopes antigos continuam reconhecidos apenas para que credenciais e histórico anteriores possam ser lidos com segurança. Após este rollout, reautorize a integração no admin para que o novo token seja emitido com o conjunto mínimo de permissões.

## OAuth / callback

```text
/api/melhor-envio/oauth/callback
https://www.proxybembem.com.br/api/melhor-envio/oauth/callback
```

Uma conta/aplicativo Melhor Envio por ambiente. Sandbox e Production usam credenciais próprias.

## Variáveis

```text
MELHOR_ENVIO_ENVIRONMENT=production
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=
MELHOR_ENVIO_REDIRECT_URI=https://www.proxybembem.com.br/api/melhor-envio/oauth/callback
MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=
CRON_SECRET=
```

A aplicação não possui nenhuma operação de compra de etiqueta nem flag de habilitação de gasto.

## Remetente

O remetente é cadastrado em:

```text
/admin/integrations/melhor-envio
```

No fluxo PF/CPF + declaração de conteúdo:

- CPF precisa ser válido;
- nome, e-mail, telefone e endereço precisam estar completos;
- o CEP do remetente precisa ser igual a `SHIPPING_ORIGIN_CEP`;
- CPF do destinatário deve ser válido e diferente do CPF do remetente;
- o CPF completo não é exibido novamente na interface.

## Cotação e checkout

O navegador envia IDs/quantidades e CEP. O servidor reconstrói preço, peso e dimensões usando o catálogo atual antes da cotação.

Production usa somente Correios PAC e SEDEX atualmente habilitados pelo projeto. O pedido salva o serviço escolhido e o snapshot de frete para que a preparação posterior não dependa de alterações futuras do catálogo.

## Preparar remessa

Para um pedido pago e marcado como `ready_to_ship`, o admin exibe **Preparar remessa**.

Essa ação:

1. valida remetente, destinatário, CPF, endereço e CEP;
2. valida o serviço e o snapshot do pacote;
3. monta a declaração de conteúdo;
4. envia a remessa para o carrinho do Melhor Envio;
5. persiste somente o resultado necessário para histórico operacional.

Ela **não movimenta saldo e não compra a etiqueta**.

Quando a preparação termina, o admin mostra **Abrir Melhor Envio**. Compra, geração e impressão são concluídas no próprio Melhor Envio.

## Status do pedido

Depois de comprar e imprimir no Melhor Envio, o operador volta ao pedido no ProxyBembem e usa **Marcar enviado**.

Não existe sincronização automática de rastreamento ou postagem com o Melhor Envio neste fluxo. O status operacional do pedido continua sob controle explícito do admin.

## Renovação OAuth

A renovação preventiva do token continua disponível em:

```text
GET /api/internal/melhor-envio/refresh
```

Ela usa o `CRON_SECRET` e apenas mantém a autorização necessária para cotação e inserção no carrinho.

## Segurança

- tokens OAuth continuam criptografados no backend;
- o navegador nunca recebe access token, refresh token ou Client Secret;
- cliente não acessa remetente nem IDs internos do provedor;
- preparação é uma mutação administrativa protegida por sessão admin, AAL2, same-origin e rate limit;
- não existe endpoint do ProxyBembem capaz de efetuar checkout da etiqueta;
- novas autorizações pedem apenas `shipping-calculate` e `cart-write`;
- migrations e registros históricos de remessas antigas são preservados para não corromper histórico.

## Checklist Production

- `MELHOR_ENVIO_ENVIRONMENT=production`;
- callback produtivo correto;
- remetente cadastrado;
- integração reautorizada após este rollout para reduzir os scopes;
- cotação funcionando;
- **Preparar remessa** adicionando o envio ao carrinho;
- compra feita diretamente no Melhor Envio;
- **Marcar enviado** feito manualmente no ProxyBembem;
- nenhum endpoint de compra/geração/impressão/cancelamento/rastreamento do Melhor Envio ativo no ProxyBembem.

## Deploy

Use o procedimento de `docs/deployment/kinghost.md`. Migrations antigas de remessas não devem ser removidas nem reaplicadas.
