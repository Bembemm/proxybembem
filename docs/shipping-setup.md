# Configuração de frete com Melhor Envio

A integração usa o Melhor Envio **somente para cotação de frete no checkout**. A compra, geração e impressão da etiqueta continuam manuais no painel do Melhor Envio depois que o pagamento do cliente for aprovado.

## 1. Arquitetura atual

O backend consulta:

```text
POST /api/v2/me/shipment/calculate
```

Bases usadas pelo código:

```text
Sandbox:    https://sandbox.melhorenvio.com.br
Production: https://melhorenvio.com.br
```

A requisição de cotação é feita apenas no servidor com `Authorization: Bearer`, `Accept: application/json`, `Content-Type: application/json` e o `User-Agent` da ProxyBembem. O navegador nunca recebe access token, refresh token, Client Secret ou chave de criptografia.

O acesso ao Melhor Envio é obtido por OAuth2. O único scope solicitado pelo fluxo atual é:

```text
shipping-calculate
```

Não peça permissões de compra, geração ou impressão de etiquetas enquanto essas etapas permanecerem manuais.

## 2. Aplicativo Sandbox e callback

Antes de configurar Production, crie um aplicativo **Sandbox** separado no Melhor Envio. Cadastre uma URL de callback estável do Preview e use exatamente essa mesma URL em `MELHOR_ENVIO_REDIRECT_URI`.

O callback implementado pelo site é:

```text
/api/melhor-envio/oauth/callback
```

Exemplo conceitual:

```text
https://<preview-estavel>/api/melhor-envio/oauth/callback
```

A URL configurada no Melhor Envio e a variável do site devem coincidir exatamente. Não reutilize Client ID/Secret do Sandbox em Production.

## 3. Variáveis server-side

O contrato final do Melhor Envio é:

```text
MELHOR_ENVIO_ENVIRONMENT=sandbox
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=
MELHOR_ENVIO_REDIRECT_URI=
MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY=
MELHOR_ENVIO_OAUTH_ADMIN_SECRET=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=
CRON_SECRET=
```

Todos esses valores, exceto os identificadores/configurações explicitamente públicas, ficam apenas no servidor. Nenhum segredo pode usar prefixo `NEXT_PUBLIC_`.

Gere **valores independentes** para a chave de criptografia, segredo administrativo, assinatura de cotação e Cron. Uma forma local é executar separadamente para cada segredo:

```bash
openssl rand -hex 32
```

`MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY` exige exatamente 64 caracteres hexadecimais, correspondentes a 256 bits. Não reutilize o mesmo valor entre `MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY`, `MELHOR_ENVIO_OAUTH_ADMIN_SECRET`, `SHIPPING_QUOTE_SECRET`, `CRON_SECRET` ou `RATE_LIMIT_SECRET`.

**Nunca envie esses valores em chat, screenshot, commit, issue, documentação ou mensagem.** Configure-os diretamente no provedor de hospedagem/secret store apropriado.

## 4. Autorização inicial do proprietário

Depois que as variáveis Sandbox estiverem configuradas e a migration OAuth estiver aplicada:

1. abra, por HTTPS, a página `/admin/integrations/melhor-envio` no Preview estável;
2. informe `MELHOR_ENVIO_OAUTH_ADMIN_SECRET` no formulário administrativo;
3. o servidor valida a origem, aplica rate limit e compara o segredo de forma timing-safe;
4. o site gera um `state` aleatório e armazena no banco **somente o SHA-256**, com validade de 10 minutos;
5. o navegador é redirecionado ao Melhor Envio pedindo apenas `shipping-calculate`;
6. após autorizar, o Melhor Envio retorna ao callback;
7. o callback consome o `state` uma única vez antes de trocar o código por tokens;
8. access token e refresh token são criptografados antes de serem persistidos;
9. o retorno final mostra apenas um status genérico `connected` ou `failed`.

O segredo administrativo não é gravado em localStorage, sessionStorage ou cookies pelo site.

## 5. Armazenamento e renovação automática

Os tokens persistidos no Supabase são envelopes AES-256-GCM. O AAD liga cada valor ao ambiente (`sandbox`/`production`) e ao tipo (`access`/`refresh`), impedindo que um ciphertext válido seja reutilizado no contexto errado.

O token manager usa versionamento e uma lease atômica para impedir que duas instâncias serverless tentem rotacionar o mesmo refresh token ao mesmo tempo. O fluxo vencedor é:

```text
claim lease -> decrypt refresh_token -> refresh no provedor ->
criptografar novos tokens -> commit compare-and-set
```

A renovação preventiva começa quando restam até 7 dias para o access token expirar. Além disso, se uma cotação receber uma falha de autenticação reconhecida do Melhor Envio, o site força a obtenção de uma **versão mais nova** do token e repete a cotação no máximo uma vez. Uma versão que o provedor acabou de rejeitar não pode ser reutilizada nesse retry.

Falhas comuns de permissão ou do provedor não provocam loop de refresh. Se o refresh for rejeitado como credencial inválida/revogada, a autorização é marcada como `reauthorization_required`; nesse estado, o frete falha de forma genérica até que o proprietário faça nova autorização pela página administrativa.

## 6. Refresh de manutenção pelo Vercel Cron

Existe uma rota interna:

```text
GET /api/internal/melhor-envio/refresh
```

Ela exige exatamente:

```text
Authorization: Bearer <CRON_SECRET>
```

O Vercel Cron chama essa rota uma vez por dia no schedule:

```text
17 3 * * *
```

A rota usa o **mesmo token manager** do checkout e nunca devolve tokens. Respostas são apenas status sanitizado. O schedule de Production só passa a operar quando existir um deployment de Production com `CRON_SECRET` configurado.

## 7. Dados de produto usados na cotação

A cotação envia, para cada item confiável do catálogo:

- peso em quilogramas;
- largura, altura e comprimento em centímetros;
- valor segurado em reais;
- quantidade.

Os dois produtos atuais usam provisoriamente o mesmo perfil físico de pacote:

```text
Deck Commander Proxy 100 Cartas
Peso:        0,50 kg
Comprimento: 25 cm
Largura:     19 cm
Altura:      4 cm

Deck Proxy 60 Cartas
Peso:        0,50 kg
Comprimento: 25 cm
Largura:     19 cm
Altura:      4 cm
```

Esses valores representam uma estimativa provisória do produto já embalado. Assim que houver balança e medidas reais de cada pacote pronto, substitua-os pelos valores medidos no catálogo.

O backend reconstrói preço, peso e dimensões pelo ID do produto e não confia nesses valores quando enviados pelo navegador. Carrinhos com produtos diferentes são enviados ao Melhor Envio como linhas separadas.

## 8. Preço, prazo e proteção contra alteração

O backend usa `custom_price` e `custom_delivery_time` das modalidades válidas retornadas pelo Melhor Envio. A ProxyBembem não adiciona margem ao valor do frete; o custo de embalagem permanece embutido no produto.

O endpoint público é:

```text
POST /api/shipping/quote
```

Fluxo de segurança:

1. o navegador envia somente IDs/quantidades e CEP;
2. o servidor reconstrói carrinho e metadados físicos do catálogo;
3. o servidor obtém um access token utilizável pelo token manager;
4. o servidor consulta o Melhor Envio;
5. cada modalidade recebe um token HMAC temporário;
6. no checkout, o servidor recota o mesmo carrinho/CEP;
7. mudança de serviço/preço retorna `shipping_changed` e exige nova confirmação;
8. somente então o pedido é reservado e o Mercado Pago recebe produtos + frete.

O preço mostrado no navegador nunca é fonte de verdade.

## 9. Depois que o cliente pagar

A geração de etiqueta **não é automática** nesta versão. Depois que o pedido estiver `approved`:

1. confira endereço, serviço escolhido e valor do frete no pedido;
2. entre no Melhor Envio;
3. compre manualmente o envio/etiqueta usando os dados do pedido;
4. gere e imprima a etiqueta;
5. poste o pacote na modalidade correspondente.

O site não chama endpoints de compra, geração, impressão ou rastreio e não precisa de webhook do Melhor Envio para esse fluxo.

## 10. Checklist de Preview/Sandbox

Antes de Production, confirme:

- aplicativo Sandbox separado;
- callback estável e idêntico ao `MELHOR_ENVIO_REDIRECT_URI`;
- somente a permissão `shipping-calculate`;
- migration OAuth aplicada com RLS/grants verificados;
- todas as variáveis Sandbox configuradas somente no Preview;
- segredos independentes gerados localmente e nunca enviados por chat;
- autorização concluída em `/admin/integrations/melhor-envio`;
- credencial persistida como ciphertext `v1.*`, sem plaintext;
- cotação real Sandbox funcionando para CEP válido;
- produto individual, quantidade maior que 1 e carrinho misto cotando normalmente;
- mudança de CEP/carrinho invalida a escolha anterior;
- mudança de preço entre cotação e checkout exige reconfirmação;
- estado OAuth consumido não pode ser reutilizado;
- rota de Cron rejeita auth ausente/incorreta e responde sem token quando autorizada;
- o Mercado Pago recebe produtos + frete no mesmo total.

## 11. Migração para Production

Production deve usar **outro aplicativo/credenciais do Melhor Envio** e `MELHOR_ENVIO_ENVIRONMENT=production`. Configure o callback produtivo HTTPS exato e gere segredos próprios para Production; não copie segredos do Preview apenas por conveniência.

A troca só deve acontecer depois que o fluxo completo de Preview/Sandbox estiver verde, incluindo OAuth, persistência criptografada, cotação real e verificação de segurança do Supabase. A configuração de Production será feita em uma etapa posterior e não exige alterar a arquitetura do checkout.
