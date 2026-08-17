# Preparação do backend de checkout

Este documento descreve a fronteira de segurança que o site deve manter antes da integração com Mercado Pago ou outro gateway.

## Regra principal

O navegador nunca é a fonte de verdade para preço, subtotal, frete ou status de pagamento.

O frontend deve enviar ao servidor somente os identificadores necessários para reconstruir o pedido, por exemplo:

```json
{
  "items": [
    {
      "productId": 1,
      "quantity": 1
    }
  ]
}
```

O servidor consulta `lib/catalog.ts`, valida as quantidades e calcula os valores em centavos antes de criar qualquer cobrança.

## Estrutura preparada

- `types/commerce.ts`: contratos compartilhados de produto, carrinho e cotação.
- `lib/catalog.ts`: catálogo único usado pela interface e pelo servidor.
- `lib/money.ts`: conversão e formatação de valores.
- `lib/server/checkout.ts`: validação e cálculo autoritativo do pedido.
- `app/api/checkout/quote/route.ts`: endpoint inicial para validar e cotar o carrinho sem realizar cobrança.
- `.env.example`: nomes das variáveis esperadas para a futura integração.

## Próxima etapa: Mercado Pago

A futura rota de criação do pagamento deve:

1. Receber os itens do carrinho e os dados necessários do comprador.
2. Recalcular o pedido com `priceCheckoutItems`.
3. Calcular frete no servidor, quando a regra de frete estiver definida.
4. Criar a preferência/pagamento do Mercado Pago usando `MERCADO_PAGO_ACCESS_TOKEN` somente no servidor.
5. Salvar um identificador interno do pedido antes de redirecionar o comprador.
6. Confirmar o pagamento por webhook; nunca considerar apenas o retorno do navegador como prova de pagamento.
7. Validar a assinatura do webhook com o segredo configurado para notificações.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` no desenvolvimento. Segredos nunca devem receber o prefixo `NEXT_PUBLIC_`.

Em produção, configure as variáveis diretamente no provedor de hospedagem e não em arquivos versionados.

## Pendências antes de cobrar

- Definir regra de frete: grátis, fixo ou calculado por CEP.
- Definir onde os pedidos serão persistidos (banco de dados ou serviço equivalente).
- Separar `cidade` e `UF` no formulário de entrega ou normalizar esse valor no servidor.
- Decidir se o fluxo inicial será Checkout Pro ou Checkout Bricks.
- Criar páginas/estados de pedido aprovado, pendente e recusado.
- Integrar o webhook e tornar seu processamento idempotente.
