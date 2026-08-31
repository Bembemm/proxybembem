import type { Product } from "@/contexts/cart-context"

export const VALIDATION_PRODUCT_ID = 9001

export const products: Product[] = [
  {
    id: 1,
    title: "Deck Commander Proxy 100 Cartas",
    image: "/products/deck-commander.png",
    originalPrice: 150,
    discountPrice: 119.9,
    tag: "Mais Vendido",
    category: "Decks",
    colors: ["Azul", "Preto"],
    featured: true,
    notice: "IMPORTANTE: LEIA ANTES DE COMPRAR",
    description:
      "Conjunto com 100 cartas proxy para uso casual, testes e montagem de decks. Não são cartas originais.",
    details: [
      {
        label: "O QUE É",
        value: "PROXIES para teste e jogo casual. NÃO SÃO CARTAS ORIGINAIS.",
      },
      {
        label: "VERSO",
        value: "Branco, sem arte no verso.",
      },
      {
        label: "SLEEVES",
        value: "Não inclusos. Recomendamos sleeves com fundo colorido ou opaco.",
      },
      {
        label: "ARTES",
        value:
          "Trabalhamos com artes do nosso banco e artes personalizadas. Impressões personalizadas podem ter custo adicional, confirmado no atendimento.",
      },
    ],
    sections: [
      {
        title: "O QUE ESTÁ INCLUSO",
        paragraphs: [
          "100 cartas de Magic: The Gathering em versão proxy + bônus surpresa.",
          "A seleção das 100 cartas é feita por você: pode ser um deck completo ou cartas variadas.",
        ],
      },
      {
        title: "COMO ENVIAR SUA LISTA",
        paragraphs: [
          "Após concluir o pedido, envie o link da sua lista pelo WhatsApp usando Moxfield, LigaMagic ou MPCFill.",
        ],
      },
      {
        title: "QUALIDADE PROXYBEMBEM",
        paragraphs: [
          "Impressão premium em papel fotográfico de alta gramatura, com cores vibrantes, texto nítido e corte de precisão para uso em sleeves.",
        ],
      },
    ],
    shipping: {
      weightKg: 0.5,
      lengthCm: 25,
      widthCm: 19,
      heightCm: 4,
    },
  },
  {
    id: 2,
    title: "Deck Proxy 60 Cartas",
    image: "/products/deck-commander.png",
    originalPrice: 69.99,
    discountPrice: 69.99,
    tag: null,
    category: "Decks",
    featured: false,
    notice: "IMPORTANTE: LEIA ANTES DE COMPRAR",
    description:
      "Conjunto com 60 cartas proxy para uso casual, testes e montagem de decks. Não são cartas originais.",
    details: [
      {
        label: "O QUE É",
        value: "PROXIES para teste e jogo casual. NÃO SÃO CARTAS ORIGINAIS.",
      },
      {
        label: "VERSO",
        value: "Branco, sem arte no verso.",
      },
      {
        label: "SLEEVES",
        value: "Não inclusos. Recomendamos sleeves com fundo colorido ou opaco.",
      },
      {
        label: "ARTES",
        value:
          "Trabalhamos com artes do nosso banco e artes personalizadas. Impressões personalizadas podem ter custo adicional, confirmado no atendimento.",
      },
    ],
    sections: [
      {
        title: "O QUE ESTÁ INCLUSO",
        paragraphs: [
          "60 cartas de Magic: The Gathering em versão proxy + bônus surpresa.",
          "A seleção das 60 cartas é feita por você: pode ser um deck completo ou cartas variadas.",
        ],
      },
      {
        title: "COMO ENVIAR SUA LISTA",
        paragraphs: [
          "Após concluir o pedido, envie o link da sua lista pelo WhatsApp usando Moxfield, LigaMagic ou MPCFill.",
        ],
      },
      {
        title: "QUALIDADE PROXYBEMBEM",
        paragraphs: [
          "Impressão premium em papel fotográfico de alta gramatura, com cores vibrantes, texto nítido e corte de precisão para uso em sleeves.",
        ],
      },
    ],
    shipping: {
      weightKg: 0.5,
      lengthCm: 25,
      widthCm: 19,
      heightCm: 4,
    },
  },
  {
    id: VALIDATION_PRODUCT_ID,
    title: "Validação de pagamento",
    image: "/products/deck-commander.png",
    originalPrice: 5,
    discountPrice: 5,
    tag: null,
    category: "Validação",
    featured: false,
    validationOnly: true,
    notice: "ITEM TEMPORÁRIO DE VALIDAÇÃO",
    description:
      "Item temporário usado somente para validar o checkout de produção. Não é um produto comercial da vitrine.",
    details: [
      {
        label: "VALOR",
        value: "R$ 5,00 para uma transação controlada de validação.",
      },
      {
        label: "FRETE",
        value: "Mantém o cálculo real de PAC/SEDEX para validar o fluxo completo.",
      },
    ],
    sections: [
      {
        title: "USO TEMPORÁRIO",
        paragraphs: [
          "Este item existe apenas durante a validação do pagamento em produção e será removido depois do teste.",
        ],
      },
    ],
    shipping: {
      weightKg: 0.5,
      lengthCm: 25,
      widthCm: 19,
      heightCm: 4,
    },
  },
]

export const validationProduct = products.find(
  (product) => product.id === VALIDATION_PRODUCT_ID,
) as Product

export const storefrontProducts = products.filter((product) => !product.validationOnly)
export const featuredProducts = storefrontProducts.filter((product) => product.featured)