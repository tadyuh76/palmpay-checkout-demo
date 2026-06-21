export const paymentMethodTypes = ["qr", "nfc", "face", "palm"] as const;

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
  detail: string;
  category: ProductCategory;
  priceCents: number;
  image: string;
  imageAlt: string;
  tags: string[];
  popular?: boolean;
};
