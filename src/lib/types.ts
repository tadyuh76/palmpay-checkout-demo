export const paymentMethodTypes = ["qr", "nfc", "face", "palm"] as const;

export const locales = ["vi", "en"] as const;

export type Locale = (typeof locales)[number];

export type LocalizedText = Record<Locale, string>;

export type PaymentMethodType = (typeof paymentMethodTypes)[number];

export type PaymentMethod = {
  id: string;
  userId: string;
  type: PaymentMethodType;
  label: string;
  status: "active" | "disabled";
  tokenRef: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  lastUsedAt: string | null;
};

export type CartLine = {
  productId: string;
  quantity: number;
};

export type Order = {
  id: string;
  userId: string;
  items: CartLine[];
  totalCents: number;
  status: "paid" | "failed";
  paymentMethodType: PaymentMethodType;
  paymentMethodId: string;
  authorizationCode: string;
  deviceTrace: Record<string, unknown>;
  createdAt: string;
};

export type ProductCategory = "Hot Coffee" | "Iced Coffee" | "Bakery" | "Dessert";

export type Product = {
  id: string;
  name: string;
  nameI18n?: LocalizedText;
  detail: string;
  detailI18n?: LocalizedText;
  category: ProductCategory;
  priceCents: number;
  image: string;
  imageAlt: string;
  imageAltI18n?: LocalizedText;
  tags: string[];
  tagsI18n?: Record<Locale, string[]>;
  popular?: boolean;
};
