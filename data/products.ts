import type { Product } from "@/contexts/cart-context"

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
    notice: "Informações importantes",
    highlights: [
      "100 cartas",
      "Lista escolhida por você",
      "Produção em até 5 dias úteis",
    ],
    description:
      "Deck com 100 cartas proxy personalizadas, produzido em alta qualidade para jogos casuais, testes e montagem de decks. Você escolhe as 100 cartas da sua lista.",
    details: [
      {
        label: "O QUE VOCÊ RECEBE",
        value: "100 cartas proxy no tamanho padrão de Magic: The Gathering.",
      },
      {
        label: "QUALIDADE",
        value:
          "Impressão em papel fotográfico com laminação, proporcionando boa definição, cores vivas e maior durabilidade.",
      },
      {
        label: "VERSO",
        value: "Verso branco, sem arte. Recomendamos o uso de sleeves opacos.",
      },
      {
        label: "COMO ESCOLHER AS CARTAS",
        value:
          "Após concluir o pedido, envie sua lista pelo WhatsApp. Pode ser por Moxfield, LigaMagic ou outro formato combinado no atendimento.",
      },
      {
        label: "ARTES",
        value:
          "Utilizamos as artes disponíveis em nosso banco. Artes ou impressões personalizadas podem ter custo adicional, sempre informado antes da produção.",
      },
    ],
    sections: [
      {
        title: "IMPORTANTE",
        paragraphs: [
          "Este produto é composto por cartas em versão proxy não oficial, destinadas a jogo casual e testes. Não são cartas oficiais de Magic: The Gathering e não devem ser utilizadas em torneios sancionados.",
        ],
      },
      {
        title: "PRAZO",
        paragraphs: ["Produção e postagem em até 5 dias úteis."],
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
    originalPrice: 99.99,
    discountPrice: 69.99,
    tag: null,
    category: "Decks",
    featured: false,
    notice: "Informações importantes",
    highlights: [
      "60 cartas",
      "Lista escolhida por você",
      "Produção em até 5 dias úteis",
    ],
    description:
      "Deck com 60 cartas proxy personalizadas, produzido em alta qualidade para jogos casuais, testes e montagem de decks. Você escolhe as 60 cartas da sua lista.",
    details: [
      {
        label: "O QUE VOCÊ RECEBE",
        value: "60 cartas proxy no tamanho padrão de Magic: The Gathering.",
      },
      {
        label: "QUALIDADE",
        value:
          "Impressão em papel fotográfico com laminação, proporcionando boa definição, cores vivas e maior durabilidade.",
      },
      {
        label: "VERSO",
        value: "Verso branco, sem arte. Recomendamos o uso de sleeves opacos.",
      },
      {
        label: "COMO ESCOLHER AS CARTAS",
        value:
          "Após concluir o pedido, envie sua lista pelo WhatsApp. Pode ser por Moxfield, LigaMagic ou outro formato combinado no atendimento.",
      },
      {
        label: "ARTES",
        value:
          "Utilizamos as artes disponíveis em nosso banco. Artes ou impressões personalizadas podem ter custo adicional, sempre informado antes da produção.",
      },
    ],
    sections: [
      {
        title: "IMPORTANTE",
        paragraphs: [
          "Este produto é composto por cartas em versão proxy não oficial, destinadas a jogo casual e testes. Não são cartas oficiais de Magic: The Gathering e não devem ser utilizadas em torneios sancionados.",
        ],
      },
      {
        title: "PRAZO",
        paragraphs: ["Produção e postagem em até 5 dias úteis."],
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

export const featuredProducts = products.filter((product) => product.featured)
