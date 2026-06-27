import type { LocalizedText, Product, ProductCategory } from "@/lib/types";

export const catalogCategories: ProductCategory[] = [
  "Hot Coffee",
  "Iced Coffee",
  "Bakery",
  "Dessert",
];

export const catalogCategoryLabels: Record<ProductCategory, LocalizedText> = {
  "Hot Coffee": {
    vi: "Cà phê nóng",
    en: "Hot Coffee",
  },
  "Iced Coffee": {
    vi: "Cà phê đá",
    en: "Iced Coffee",
  },
  Bakery: {
    vi: "Bánh nướng",
    en: "Bakery",
  },
  Dessert: {
    vi: "Tráng miệng",
    en: "Dessert",
  },
};

export const catalog: Product[] = [
  {
    id: "signature-latte",
    name: "Latte đặc biệt",
    nameI18n: {
      vi: "Latte đặc biệt",
      en: "Signature Latte",
    },
    detail: "Espresso double, sữa đánh nóng, latte art rosetta",
    detailI18n: {
      vi: "Espresso double, sữa đánh nóng, latte art rosetta",
      en: "Double espresso, steamed milk, rosetta art",
    },
    category: "Hot Coffee",
    priceCents: 52000,
    image: "/menu/signature-latte.jpg",
    imageAlt: "Một ly latte nóng trong tách sứ với latte art",
    imageAltI18n: {
      vi: "Một ly latte nóng trong tách sứ với latte art",
      en: "A hot latte in a ceramic cup with latte art",
    },
    tags: ["latte", "espresso", "sữa"],
    tagsI18n: {
      vi: ["latte", "espresso", "sữa"],
      en: ["latte", "espresso", "milk"],
    },
    popular: true,
  },
  {
    id: "salted-caramel-cappuccino",
    name: "Cappuccino caramel muối",
    nameI18n: {
      vi: "Cappuccino caramel muối",
      en: "Salted Caramel Cappuccino",
    },
    detail: "Espresso, foam sữa mịn, sốt caramel",
    detailI18n: {
      vi: "Espresso, foam sữa mịn, sốt caramel",
      en: "Espresso, microfoam, caramel drizzle",
    },
    category: "Hot Coffee",
    priceCents: 58000,
    image: "/menu/salted-caramel-cappuccino.jpg",
    imageAlt: "Một ly cappuccino caramel trong tách sứ",
    imageAltI18n: {
      vi: "Một ly cappuccino caramel trong tách sứ",
      en: "A caramel cappuccino in a ceramic cup",
    },
    tags: ["cappuccino", "caramel", "espresso"],
    tagsI18n: {
      vi: ["cappuccino", "caramel", "espresso"],
      en: ["cappuccino", "caramel", "espresso"],
    },
    popular: true,
  },
  {
    id: "vanilla-oat-flat-white",
    name: "Flat white yến mạch vanilla",
    nameI18n: {
      vi: "Flat white yến mạch vanilla",
      en: "Vanilla Oat Flat White",
    },
    detail: "Sữa yến mạch, vanilla, ristretto espresso",
    detailI18n: {
      vi: "Sữa yến mạch, vanilla, ristretto espresso",
      en: "Oat milk, vanilla, ristretto espresso",
    },
    category: "Hot Coffee",
    priceCents: 59000,
    image: "/menu/vanilla-oat-flat-white.jpg",
    imageAlt: "Một ly flat white trong tách sứ nhỏ",
    imageAltI18n: {
      vi: "Một ly flat white trong tách sứ nhỏ",
      en: "A flat white in a small ceramic cup",
    },
    tags: ["flat white", "yến mạch", "vanilla"],
    tagsI18n: {
      vi: ["flat white", "yến mạch", "vanilla"],
      en: ["flat white", "oat", "vanilla"],
    },
  },
  {
    id: "dark-mocha",
    name: "Mocha socola đậm",
    nameI18n: {
      vi: "Mocha socola đậm",
      en: "Dark Mocha",
    },
    detail: "Socola đen, espresso, kem tươi",
    detailI18n: {
      vi: "Socola đen, espresso, kem tươi",
      en: "Dark chocolate, espresso, whipped cream",
    },
    category: "Hot Coffee",
    priceCents: 62000,
    image: "/menu/dark-mocha.jpg",
    imageAlt: "Một ly mocha đậm với kem tươi trong cốc sứ",
    imageAltI18n: {
      vi: "Một ly mocha đậm với kem tươi trong cốc sứ",
      en: "A dark mocha with whipped cream in a ceramic mug",
    },
    tags: ["mocha", "socola", "espresso"],
    tagsI18n: {
      vi: ["mocha", "socola", "espresso"],
      en: ["mocha", "chocolate", "espresso"],
    },
  },
  {
    id: "vietnamese-phin-iced-coffee",
    name: "Cà phê phin sữa đá",
    nameI18n: {
      vi: "Cà phê phin sữa đá",
      en: "Vietnamese Phin Iced Coffee",
    },
    detail: "Robusta, sữa đặc, đá lắc thủ công",
    detailI18n: {
      vi: "Robusta, sữa đặc, đá lắc thủ công",
      en: "Robusta, condensed milk, hand-shaken ice",
    },
    category: "Iced Coffee",
    priceCents: 49000,
    image: "/menu/vietnamese-phin-iced-coffee.jpg",
    imageAlt: "Một ly cà phê sữa đá Việt Nam với sữa đặc",
    imageAltI18n: {
      vi: "Một ly cà phê sữa đá Việt Nam với sữa đặc",
      en: "A glass of iced Vietnamese coffee with condensed milk",
    },
    tags: ["phin", "cà phê đá", "sữa đặc"],
    tagsI18n: {
      vi: ["phin", "cà phê đá", "sữa đặc"],
      en: ["phin", "iced", "condensed milk"],
    },
    popular: true,
  },
  {
    id: "coconut-cold-brew",
    name: "Cold brew dừa",
    nameI18n: {
      vi: "Cold brew dừa",
      en: "Coconut Cold Brew",
    },
    detail: "Cold brew, kem dừa, đá viên trong",
    detailI18n: {
      vi: "Cold brew, kem dừa, đá viên trong",
      en: "Cold brew, coconut cream, crystal ice",
    },
    category: "Iced Coffee",
    priceCents: 64000,
    image: "/menu/coconut-cold-brew.jpg",
    imageAlt: "Một ly cold brew dừa với lớp foam",
    imageAltI18n: {
      vi: "Một ly cold brew dừa với lớp foam",
      en: "A glass of coconut cold brew with foam",
    },
    tags: ["cold brew", "dừa", "cà phê đá"],
    tagsI18n: {
      vi: ["cold brew", "dừa", "cà phê đá"],
      en: ["cold brew", "coconut", "iced"],
    },
  },
  {
    id: "espresso-tonic",
    name: "Espresso tonic",
    nameI18n: {
      vi: "Espresso tonic",
      en: "Espresso Tonic",
    },
    detail: "Tonic có ga, espresso nổi tầng, tinh dầu cam chanh",
    detailI18n: {
      vi: "Tonic có ga, espresso nổi tầng, tinh dầu cam chanh",
      en: "Sparkling tonic, espresso float, citrus oil",
    },
    category: "Iced Coffee",
    priceCents: 61000,
    image: "/menu/espresso-tonic.jpg",
    imageAlt: "Một ly espresso tonic cao với đá",
    imageAltI18n: {
      vi: "Một ly espresso tonic cao với đá",
      en: "A tall glass of espresso tonic with ice",
    },
    tags: ["tonic", "có ga", "espresso"],
    tagsI18n: {
      vi: ["tonic", "có ga", "espresso"],
      en: ["tonic", "sparkling", "espresso"],
    },
  },
  {
    id: "matcha-cream-latte",
    name: "Matcha latte kem",
    nameI18n: {
      vi: "Matcha latte kem",
      en: "Matcha Cream Latte",
    },
    detail: "Matcha ceremonial, sữa, lớp kem mịn",
    detailI18n: {
      vi: "Matcha ceremonial, sữa, lớp kem mịn",
      en: "Ceremonial matcha, milk, cream cap",
    },
    category: "Iced Coffee",
    priceCents: 65000,
    image: "/menu/matcha-cream-latte.jpg",
    imageAlt: "Một ly matcha latte đá với lớp kem",
    imageAltI18n: {
      vi: "Một ly matcha latte đá với lớp kem",
      en: "A glass of iced matcha latte with cream",
    },
    tags: ["matcha", "kem", "cà phê đá"],
    tagsI18n: {
      vi: ["matcha", "kem", "cà phê đá"],
      en: ["matcha", "cream", "iced"],
    },
  },
  {
    id: "almond-croissant",
    name: "Croissant hạnh nhân",
    nameI18n: {
      vi: "Croissant hạnh nhân",
      en: "Almond Croissant",
    },
    detail: "Croissant bơ, kem hạnh nhân, lát hạnh nhân nướng",
    detailI18n: {
      vi: "Croissant bơ, kem hạnh nhân, lát hạnh nhân nướng",
      en: "Butter croissant, almond cream, toasted flakes",
    },
    category: "Bakery",
    priceCents: 55000,
    image: "/menu/almond-croissant.jpg",
    imageAlt: "Một chiếc croissant hạnh nhân trên đĩa sứ",
    imageAltI18n: {
      vi: "Một chiếc croissant hạnh nhân trên đĩa sứ",
      en: "An almond croissant on a ceramic plate",
    },
    tags: ["croissant", "hạnh nhân", "bánh ngọt"],
    tagsI18n: {
      vi: ["croissant", "hạnh nhân", "bánh ngọt"],
      en: ["croissant", "almond", "pastry"],
    },
    popular: true,
  },
  {
    id: "cinnamon-roll",
    name: "Bánh cuộn quế",
    nameI18n: {
      vi: "Bánh cuộn quế",
      en: "Cinnamon Roll",
    },
    detail: "Brioche mềm, đường quế, lớp glaze",
    detailI18n: {
      vi: "Brioche mềm, đường quế, lớp glaze",
      en: "Soft brioche roll, cinnamon sugar, glaze",
    },
    category: "Bakery",
    priceCents: 48000,
    image: "/menu/cinnamon-roll.jpg",
    imageAlt: "Một chiếc bánh cuộn quế phủ glaze trên đĩa sứ",
    imageAltI18n: {
      vi: "Một chiếc bánh cuộn quế phủ glaze trên đĩa sứ",
      en: "A glazed cinnamon roll on a ceramic plate",
    },
    tags: ["quế", "bánh cuộn", "bánh ngọt"],
    tagsI18n: {
      vi: ["quế", "bánh cuộn", "bánh ngọt"],
      en: ["cinnamon", "roll", "pastry"],
    },
  },
  {
    id: "blueberry-muffin",
    name: "Muffin việt quất",
    nameI18n: {
      vi: "Muffin việt quất",
      en: "Blueberry Muffin",
    },
    detail: "Muffin vàng, việt quất, vụn bánh vanilla",
    detailI18n: {
      vi: "Muffin vàng, việt quất, vụn bánh vanilla",
      en: "Golden muffin, blueberries, vanilla crumb",
    },
    category: "Bakery",
    priceCents: 42000,
    image: "/menu/blueberry-muffin.jpg",
    imageAlt: "Một chiếc muffin việt quất trên đĩa sứ",
    imageAltI18n: {
      vi: "Một chiếc muffin việt quất trên đĩa sứ",
      en: "A blueberry muffin on a ceramic plate",
    },
    tags: ["muffin", "việt quất", "bánh"],
    tagsI18n: {
      vi: ["muffin", "việt quất", "bánh"],
      en: ["muffin", "blueberry", "cake"],
    },
  },
  {
    id: "tiramisu-cup",
    name: "Ly tiramisu",
    nameI18n: {
      vi: "Ly tiramisu",
      en: "Tiramisu Cup",
    },
    detail: "Mascarpone, bánh sponge espresso, cacao",
    detailI18n: {
      vi: "Mascarpone, bánh sponge espresso, cacao",
      en: "Mascarpone, espresso sponge, cocoa",
    },
    category: "Dessert",
    priceCents: 69000,
    image: "/menu/tiramisu-cup.jpg",
    imageAlt: "Một ly tiramisu phủ cacao",
    imageAltI18n: {
      vi: "Một ly tiramisu phủ cacao",
      en: "A tiramisu cup dessert with cocoa",
    },
    tags: ["tiramisu", "tráng miệng", "espresso"],
    tagsI18n: {
      vi: ["tiramisu", "tráng miệng", "espresso"],
      en: ["tiramisu", "dessert", "espresso"],
    },
  },
];

export function formatVnd(cents: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(cents);
}

export function getProduct(productId: string) {
  return catalog.find((item) => item.id === productId);
}
