# Configuração de frete com Melhor Envio

A integração atual usa o Melhor Envio **somente para cotação de frete no checkout**. A compra, geração e impressão da etiqueta continuam manuais no painel do Melhor Envio depois que o pagamento do cliente for aprovado.

## 1. O que o site faz

O backend consulta:

```text
POST /api/v2/me/shipment/calculate
```

Bases usadas pelo código:

```text
Sandbox:    https://sandbox.melhorenvio.com.br
Production: https://melhorenvio.com.br
```

A requisição é feita apenas no servidor com:

```text
Authorization: Bearer <token>
Accept: application/json
Content-Type: application/json
User-Agent: ProxyBembem (contato@proxybembem.com.br)
```

O navegador nunca recebe o token do Melhor Envio.

## 2. Aplicativo, permissão e token

Para a integração por aplicativo, solicite somente os scopes necessários. No fluxo atual, a API é usada para cotação, portanto a permissão essencial é:

```text
shipping-calculate
```

Não é necessário pedir permissões de compra, geração ou impressão de etiquetas enquanto essas etapas permanecerem manuais.

O código desta versão espera um **Bearer token válido já emitido** em `MELHOR_ENVIO_ACCESS_TOKEN`. Ele não armazena `Client Secret`, não implementa o callback OAuth e não renova `refresh_token` automaticamente.

Se o token usado vier do fluxo OAuth2, a documentação atual do Melhor Envio informa validade de 30 dias para `access_token` e 45 dias para `refresh_token`. A emissão/renovação deve ser gerenciada fora do checkout atual e a variável da Vercel deve ser atualizada quando necessário. Se a conta disponibilizar outro tipo de token diretamente no painel, siga a validade e as permissões mostradas pelo próprio Melhor Envio.

Nunca envie Client Secret, access token ou refresh token em chat, screenshot, repositório ou variável `NEXT_PUBLIC_*`.

## 3. Variáveis da Vercel

Preview/Sandbox:

```text
MELHOR_ENVIO_ENVIRONMENT=sandbox
MELHOR_ENVIO_ACCESS_TOKEN=
MELHOR_ENVIO_USER_AGENT=ProxyBembem (contato@proxybembem.com.br)
SHIPPING_ORIGIN_CEP=86730000
SHIPPING_QUOTE_SECRET=
```

Production usa:

```text
MELHOR_ENVIO_ENVIRONMENT=production
```

junto com um token válido do ambiente de Production. Sandbox e Production do Melhor Envio são ambientes separados; não reutilize credenciais esperando que os dados sejam compartilhados entre eles.

`SHIPPING_QUOTE_SECRET` deve ser um segredo aleatório forte com pelo menos 32 caracteres. Ele assina a escolha de frete enviada ao navegador e não é uma credencial fornecida pelo Melhor Envio.

## 4. Dados de produto usados na cotação

A cotação por produto envia, para cada item confiável do catálogo:

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

Esses valores representam uma estimativa provisória do produto já embalado e podem ser alterados individualmente depois no cadastro sem mudar a arquitetura do checkout. Assim que houver balança e medidas reais de cada pacote pronto, substitua os valores provisórios pelos medidos.

Cada produto possui seu próprio perfil de peso/dimensões no catálogo, mesmo quando os valores provisórios coincidem. O backend reconstrói esses dados pelo ID do produto e ignora preço, peso ou dimensão enviados pelo navegador. Carrinhos com produtos diferentes são enviados ao Melhor Envio como linhas separadas, permitindo que o provedor calcule o empacotamento/volumes.

## 5. Como o preço e o prazo são escolhidos

A integração não fixa Correios, Jadlog ou outra transportadora. O backend recebe as modalidades disponíveis para aquele CEP/pacote, elimina respostas inválidas e mostra ao cliente somente serviços válidos retornados pelo Melhor Envio.

O código usa os campos recomendados pelo provedor:

```text
custom_price
custom_delivery_time
```

O cliente paga exatamente `custom_price`; a ProxyBembem não adiciona margem, embalagem ou taxa de manuseio ao valor do frete. O custo da embalagem permanece embutido no preço do produto.

No Sandbox, a própria documentação do Melhor Envio informa que a disponibilidade de transportadoras é limitada e pode mudar; atualmente o ambiente de testes é limitado principalmente a simulações de Correios e Jadlog.

## 6. Proteção contra alteração de frete

O endpoint público do site é:

```text
POST /api/shipping/quote
```

Fluxo:

1. o navegador envia IDs/quantidades e CEP;
2. o servidor reconstrói o carrinho e os dados físicos do catálogo;
3. o servidor consulta o Melhor Envio;
4. cada opção recebe um token HMAC assinado e temporário;
5. o navegador envia ao checkout somente o token da opção escolhida;
6. antes de criar o pagamento, o servidor recota o mesmo carrinho/CEP;
7. se o serviço não existir mais ou o preço tiver mudado, o checkout não cobra silenciosamente o novo valor: retorna `shipping_changed` e exige nova confirmação;
8. somente depois o pedido é reservado e o Mercado Pago recebe produtos + frete.

O preço mostrado pelo navegador nunca é aceito como fonte de verdade.

## 7. Depois que o cliente pagar

A geração de etiqueta **não é automática** nesta versão.

Depois que o pedido estiver como `approved`:

1. abra o pedido e confira endereço, serviço escolhido e valor do frete;
2. entre no Melhor Envio;
3. faça manualmente a compra do envio/etiqueta usando os dados do pedido;
4. gere e imprima a etiqueta;
5. poste o pacote na modalidade correspondente.

Como a compra da etiqueta é manual, o site não chama endpoints de carrinho, checkout, geração, impressão ou rastreio do Melhor Envio e não precisa de webhook do Melhor Envio para funcionar.

## 8. Checklist de Sandbox

Antes de Production:

- token Sandbox válido com permissão para cotação;
- `MELHOR_ENVIO_ENVIRONMENT=sandbox`;
- `SHIPPING_ORIGIN_CEP=86730000`;
- `SHIPPING_QUOTE_SECRET` configurado apenas no servidor;
- CEP de destino retorna ao menos uma modalidade válida;
- cada produto individual cota normalmente;
- carrinho com quantidade maior que 1 cota normalmente;
- carrinho misto com Deck Commander 100 + Deck 60 cota normalmente;
- alteração de CEP/carrinho invalida a escolha anterior;
- mudança de preço entre cotação e checkout exige reconfirmação;
- o Mercado Pago recebe todos os produtos + frete no mesmo total;
- a página do pedido mostra todos os itens, transportadora, serviço, prazo, frete, total e endereço.

## 9. Migração para Production

Production deve receber configuração própria:

```text
MELHOR_ENVIO_ENVIRONMENT=production
MELHOR_ENVIO_ACCESS_TOKEN=<token produtivo válido>
```

Mantenha `MELHOR_ENVIO_USER_AGENT`, CEP de origem e segredos server-side configurados. Faça a troca apenas depois do fluxo completo em Preview/Sandbox estar verde e use as permissões mínimas necessárias.
