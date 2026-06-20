import type { Product } from "@/lib/types";

export const catalog: Product[] = [
  {
    id: "iced-latte",
    name: "Iced Latte",
    detail: "Double shot, fresh milk",
    priceCents: 39000,
    accent: "bg-emerald-50 text-emerald-700 border-emerald-100",
    icon: "coffee",
  },
  {
    id: "banh-mi",
    name: "Banh Mi",
    detail: "Grilled chicken, herbs",
    priceCents: 45000,
    accent: "bg-amber-50 text-amber-700 border-amber-100",
    icon: "sandwich",
  },
  {
    id: "green-bowl",
    name: "Green Bowl",
    detail: "Rice, avocado, greens",
    priceCents: 69000,
    accent: "bg-lime-50 text-lime-700 border-lime-100",
    icon: "soup",
  },
  {
    id: "citrus-tea",
    name: "Citrus Tea",
    detail: "Jasmine, orange, ice",
    priceCents: 32000,
    accent: "bg-sky-50 text-sky-700 border-sky-100",
    icon: "juice",
  },
  {
    id: "caesar-cup",
    name: "Caesar Cup",
    detail: "Romaine, parmesan",
    priceCents: 52000,
    accent: "bg-teal-50 text-teal-700 border-teal-100",
    icon: "salad",
  },
  {
    id: "cookie-pair",
    name: "Cookie Pair",
    detail: "Sea salt chocolate",
    priceCents: 28000,
    accent: "bg-rose-50 text-rose-700 border-rose-100",
    icon: "cookie",
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
