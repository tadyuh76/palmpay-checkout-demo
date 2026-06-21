"use client";

import {
  BadgeCheck,
  Check,
  CircleCheck,
  CreditCard,
  Hand,
  Loader2,
  LogOut,
  Minus,
  Nfc,
  Plus,
  QrCode,
  ReceiptText,
  ScanFace,
  ScanLine,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { catalog, catalogCategories, formatVnd, getProduct } from "@/lib/catalog";
import { authClient } from "@/lib/auth-client";
import type {
  CartLine,
  Order,
  PaymentMethod,
  PaymentMethodType,
  Product,
  ProductCategory,
} from "@/lib/types";

type Cart = Record<string, number>;
type FaceApi = typeof import("@vladmandic/face-api");
type Stage = "catalog" | "checkout" | "receipt";
type EnrollmentMode = PaymentMethodType | null;

type NfcReader = {
  scan: () => Promise<void>;
  addEventListener: (
    type: "reading" | "readingerror",
    listener: (event: { serialNumber?: string }) => void,
    options?: { once?: boolean },
  ) => void;
};

type NfcWindow = Window & {
  NDEFReader?: new () => NfcReader;
};

const methodCopy: Record<
  PaymentMethodType,
  { label: string; description: string; icon: typeof QrCode }
> = {
  qr: {
    label: "QR code",
    description: "Scan merchant code",
    icon: QrCode,
  },
  nfc: {
    label: "NFC card",
    description: "Tap tokenized card",
    icon: Nfc,
  },
  face: {
    label: "Face recognition",
    description: "Camera match",
    icon: ScanFace,
  },
  palm: {
    label: "Palm veins",
    description: "Scanner match",
    icon: Hand,
  },
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const appSurfaceClass = "bg-[#f6efe5] text-stone-950";
const inputFocusClass = "focus:border-amber-900 focus:ring-2 focus:ring-amber-100";
const primaryButtonClass =
  "bg-[#5a341f] text-white shadow-sm shadow-stone-950/10 hover:bg-[#432615] disabled:bg-stone-300 disabled:shadow-none";
const primaryIconClass = "bg-[#5a341f] text-amber-50";
const primarySelectedClass = "border-amber-900 bg-amber-50/80";
const primarySoftClass = "border-amber-200 bg-amber-50 text-amber-900";
const categoryOptions: Array<ProductCategory | "All"> = [
  "All",
  ...catalogCategories,
];

export function DemoApp() {
  const {
    data: session,
    isPending,
    refetch,
  } = authClient.useSession();
  const [cart, setCart] = useState<Cart>({});
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [enrollmentMode, setEnrollmentMode] = useState<EnrollmentMode>(null);
  const [stage, setStage] = useState<Stage>("catalog");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<ProductCategory | "All">("All");
  const [activePayment, setActivePayment] = useState<PaymentMethod | null>(null);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  const user = session?.user;

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => ({ productId, quantity }))
        .filter((line) => line.quantity > 0 && getProduct(line.productId)),
    [cart],
  );

  const totalCents = useMemo(
    () =>
      cartLines.reduce((sum, line) => {
        const product = getProduct(line.productId);
        return sum + (product?.priceCents ?? 0) * line.quantity;
      }, 0),
    [cartLines],
  );

  const selectedMethod =
    methods.find((method) => method.id === selectedMethodId) ?? methods[0];

  const loadAccountData = useCallback(async () => {
    if (!user) {
      setMethods([]);
      setOrders([]);
      return;
    }

    setLoadingData(true);
    setError("");

    try {
      const [methodsResponse, ordersResponse] = await Promise.all([
        fetch("/api/methods"),
        fetch("/api/orders"),
      ]);

      if (!methodsResponse.ok || !ordersResponse.ok) {
        throw new Error("Could not load account data");
      }

      const methodsData = (await methodsResponse.json()) as {
        methods: PaymentMethod[];
      };
      const ordersData = (await ordersResponse.json()) as { orders: Order[] };

      setMethods(methodsData.methods);
      setOrders(ordersData.orders);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load account data",
      );
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadAccountData(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadAccountData]);

  const addToCart = (productId: string) => {
    setCart((current) => ({
      ...current,
      [productId]: Math.min((current[productId] ?? 0) + 1, 20),
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[productId] ?? 0) - 1;
      if (quantity > 0) {
        next[productId] = quantity;
      } else {
        delete next[productId];
      }
      return next;
    });
  };

  const enrollMethod = async (
    type: PaymentMethodType,
    metadata: Record<string, unknown> = {},
  ) => {
    setError("");
    const response = await fetch("/api/methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        label: methodCopy[type].label,
        metadata,
      }),
    });

    if (!response.ok) {
      throw new Error("Could not add method");
    }

    const data = (await response.json()) as { method: PaymentMethod };
    setMethods((current) => {
      const withoutSameType = current.filter((item) => item.type !== type);
      return [...withoutSameType, data.method];
    });
    setSelectedMethodId(data.method.id);
    setEnrollmentMode(null);
  };

  const deleteMethod = async (methodId: string) => {
    const response = await fetch(`/api/methods?id=${methodId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError("Could not remove method");
      return;
    }

    setMethods((current) => current.filter((method) => method.id !== methodId));
    if (selectedMethodId === methodId) {
      setSelectedMethodId("");
    }
  };

  const startCheckout = () => {
    if (!cartLines.length) {
      return;
    }

    if (!methods.length) {
      setEnrollmentMode("palm");
      return;
    }

    setStage("checkout");
  };

  const startPayment = () => {
    if (!selectedMethod || !cartLines.length) {
      return;
    }

    setActivePayment(selectedMethod);
  };

  const completePayment = async (
    method: PaymentMethod,
    deviceTrace: Record<string, unknown>,
  ) => {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cartLines,
        paymentMethodId: method.id,
        paymentMethodType: method.type,
        deviceTrace,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? "Payment was not saved");
    }

    const data = (await response.json()) as { order: Order };
    setReceipt(data.order);
    setOrders((current) => [data.order, ...current].slice(0, 8));
    setCart({});
    setActivePayment(null);
    setStage("receipt");
    await loadAccountData();
  };

  if (isPending) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthPanel onSignedIn={() => refetch()} />;
  }

  return (
    <main className={cn("min-h-screen", appSurfaceClass)}>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-[#fffaf3]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                primaryIconClass,
              )}
            >
              <Hand size={20} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">PalmPay Coffee</p>
              <p className="truncate text-xs text-stone-500">{user.email}</p>
            </div>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-100"
            onClick={async () => {
              await authClient.signOut();
              setCart({});
              setMethods([]);
              setOrders([]);
              await refetch();
            }}
            type="button"
          >
            <LogOut size={16} aria-hidden />
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">
                Coffee menu
              </h1>
              <p className="text-sm text-stone-500">
                Order drinks and bites, then checkout.
              </p>
            </div>
            <SegmentedStage value={stage} onChange={setStage} />
          </div>

          {stage === "catalog" && (
            <CatalogGrid
              cart={cart}
              category={selectedCategory}
              onAdd={addToCart}
              onCategoryChange={setSelectedCategory}
              onQueryChange={setCatalogQuery}
              onRemove={removeFromCart}
              query={catalogQuery}
            />
          )}

          {stage === "checkout" && (
            <CheckoutPanel
              cartLines={cartLines}
              selectedMethod={selectedMethod}
              totalCents={totalCents}
              onBack={() => setStage("catalog")}
              onPay={startPayment}
            />
          )}

          {stage === "receipt" && receipt && (
            <ReceiptPanel
              order={receipt}
              onNewOrder={() => {
                setReceipt(null);
                setStage("catalog");
              }}
            />
          )}
        </section>

        <aside className="space-y-5">
          <CartPanel
            cartLines={cartLines}
            totalCents={totalCents}
            onAdd={addToCart}
            onRemove={removeFromCart}
            onCheckout={startCheckout}
          />

          <MethodPanel
            loading={loadingData}
            methods={methods}
            selectedMethodId={selectedMethodId || methods[0]?.id || ""}
            onSelect={setSelectedMethodId}
            onEnroll={setEnrollmentMode}
            onDelete={deleteMethod}
          />

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <OrdersPanel orders={orders} />
        </aside>
      </div>

      {enrollmentMode && (
        <EnrollmentDialog
          mode={enrollmentMode}
          userId={user.id}
          onClose={() => setEnrollmentMode(null)}
          onEnroll={(type, metadata) => enrollMethod(type, metadata)}
        />
      )}

      {activePayment && (
        <PaymentDialog
          method={activePayment}
          userId={user.id}
          totalCents={totalCents}
          cartLines={cartLines}
          onClose={() => setActivePayment(null)}
          onAuthorized={(trace) => completePayment(activePayment, trace)}
        />
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6efe5]">
      <div className="inline-flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
        <Loader2 className="animate-spin" size={18} aria-hidden />
        Loading
      </div>
    </div>
  );
}

function authErrorMessage(
  message: string | undefined,
  mode: "signin" | "signup",
) {
  if (message?.trim()) {
    return message;
  }

  return mode === "signin"
    ? "Sign in failed. Check the password, create the account first, or make sure the local server is running."
    : "Account could not be created. Make sure the local server is running, then try again.";
}

function AuthPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("demo@palmpay.local");
  const [password, setPassword] = useState("palmpay123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const googleEnabled =
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: name.trim() || email.split("@")[0],
              email,
              password,
            })
          : await authClient.signIn.email({
              email,
              password,
              rememberMe: true,
            });

      if (result.error) {
        setError(authErrorMessage(result.error.message, mode));
        return;
      }

      onSignedIn();
    } catch {
      setError(
        "Could not reach the auth server. Make sure the local server is running, then try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={cn("flex min-h-screen items-center justify-center px-4 py-8", appSurfaceClass)}>
      <section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-lg",
              primaryIconClass,
            )}
          >
            <Hand size={22} aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold">PalmPay Coffee</h1>
            <p className="text-sm text-neutral-500">Sign in to continue</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
          {(["signin", "signup"] as const).map((item) => (
            <button
              className={cn(
                "h-9 rounded-md text-sm font-medium transition",
                mode === item
                  ? "bg-white text-neutral-950 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-950",
              )}
              key={item}
              onClick={() => setMode(item)}
              type="button"
            >
              {item === "signin" ? "Sign in" : "Create"}
            </button>
          ))}
        </div>

        <form className="space-y-3" onSubmit={submit}>
          {mode === "signup" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Name</span>
              <input
                className={cn(
                  "h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition",
                  inputFocusClass,
                )}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                value={name}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              className={cn(
                "h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition",
                inputFocusClass,
              )}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              className={cn(
                "h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition",
                inputFocusClass,
              )}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            className={cn(
              "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              primaryButtonClass,
            )}
            disabled={loading}
            type="submit"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : null}
            Continue
          </button>
        </form>

        {googleEnabled && (
          <button
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100"
            onClick={() =>
              authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
              })
            }
            type="button"
          >
            <ShieldCheck size={16} aria-hidden />
            Continue with Google
          </button>
        )}
      </section>
    </main>
  );
}

function SegmentedStage({
  value,
  onChange,
}: {
  value: Stage;
  onChange: (stage: Stage) => void;
}) {
  const stages: Array<{ value: Stage; label: string; icon: typeof ShoppingBag }> =
    [
      { value: "catalog", label: "Shop", icon: ShoppingBag },
      { value: "checkout", label: "Pay", icon: WalletCards },
      { value: "receipt", label: "Receipt", icon: ReceiptText },
    ];

  return (
    <div className="grid grid-cols-3 rounded-lg border border-neutral-200 bg-white p-1">
      {stages.map((stage) => {
        const Icon = stage.icon;
        return (
          <button
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition",
              value === stage.value
                ? "bg-[#5a341f] text-white shadow-sm shadow-stone-950/10"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950",
            )}
            key={stage.value}
            onClick={() => onChange(stage.value)}
            type="button"
          >
            <Icon size={15} aria-hidden />
            {stage.label}
          </button>
        );
      })}
    </div>
  );
}

function CatalogGrid({
  cart,
  category,
  onAdd,
  onCategoryChange,
  onQueryChange,
  onRemove,
  query,
}: {
  cart: Cart;
  category: ProductCategory | "All";
  onAdd: (productId: string) => void;
  onCategoryChange: (category: ProductCategory | "All") => void;
  onQueryChange: (query: string) => void;
  onRemove: (productId: string) => void;
  query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const products = useMemo(
    () =>
      catalog.filter((product) => {
        const matchesCategory =
          category === "All" || product.category === category;
        const matchesQuery =
          !normalizedQuery ||
          [
            product.name,
            product.detail,
            product.category,
            ...product.tags,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);

        return matchesCategory && matchesQuery;
      }),
    [category, normalizedQuery],
  );

  return (
    <>
      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={17}
            aria-hidden
          />
          <input
            className={cn(
              "h-11 w-full rounded-lg border border-stone-200 bg-[#fffaf3] pl-10 pr-3 text-sm outline-none transition placeholder:text-stone-400",
              inputFocusClass,
            )}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search coffee, pastries"
            value={query}
          />
        </label>

        <div className="flex gap-2 overflow-x-auto pb-1 lg:justify-end lg:pb-0">
          {categoryOptions.map((item) => (
            <button
              className={cn(
                "h-11 shrink-0 rounded-lg border px-3 text-sm font-medium transition",
                category === item
                  ? "border-amber-900 bg-[#5a341f] text-white shadow-sm shadow-stone-950/10"
                  : "border-stone-200 bg-[#fffaf3] text-stone-600 hover:border-amber-300 hover:text-stone-950",
              )}
              key={item}
              onClick={() => onCategoryChange(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-[#fffaf3]/70 px-4 py-12 text-center text-sm text-stone-500">
          No menu items found
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              quantity={cart[product.id] ?? 0}
              onAdd={() => onAdd(product.id)}
              onRemove={() => onRemove(product.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ProductCard({
  product,
  quantity,
  onAdd,
  onRemove,
}: {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-stone-200 bg-[#fffaf3] shadow-sm">
      <div className="relative aspect-square bg-amber-50">
        <Image
          alt={product.imageAlt}
          className="object-cover"
          fill
          sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 92vw"
          src={product.image}
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-stone-700 shadow-sm backdrop-blur">
            {product.category}
          </span>
          {product.popular && (
            <span className="rounded-full bg-amber-900/90 px-2 py-1 text-xs font-medium text-white shadow-sm backdrop-blur">
              Popular
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-stone-950">
              {product.name}
            </h2>
            <p className="mt-1 min-h-10 text-sm leading-5 text-stone-500">
              {product.detail}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-stone-900">
            {formatVnd(product.priceCents)}
          </p>
        </div>

        <div className="mt-4 grid h-10 grid-cols-[40px_1fr_40px] items-center rounded-lg border border-stone-200 bg-white">
          <button
            aria-label={`Remove ${product.name}`}
            className="flex h-10 items-center justify-center rounded-l-lg text-stone-500 transition hover:bg-amber-50 hover:text-amber-900 disabled:text-stone-300"
            disabled={quantity === 0}
            onClick={onRemove}
            type="button"
          >
            <Minus size={16} aria-hidden />
          </button>
          <div className="text-center text-sm font-semibold text-stone-900">
            {quantity}
          </div>
          <button
            aria-label={`Add ${product.name}`}
            className="flex h-10 items-center justify-center rounded-r-lg text-stone-500 transition hover:bg-amber-50 hover:text-amber-900"
            onClick={onAdd}
            type="button"
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}

function CartPanel({
  cartLines,
  totalCents,
  onAdd,
  onRemove,
  onCheckout,
}: {
  cartLines: CartLine[];
  totalCents: number;
  onAdd: (productId: string) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} aria-hidden />
          <h2 className="font-semibold">Order</h2>
        </div>
        <span className="text-sm text-neutral-500">
          {cartLines.reduce((sum, item) => sum + item.quantity, 0)} items
        </span>
      </div>

      <div className="space-y-3">
        {cartLines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-8 text-center text-sm text-neutral-500">
            Cart is empty
          </div>
        ) : (
          cartLines.map((line) => {
            const product = getProduct(line.productId);
            if (!product) return null;

            return (
              <div
                className="grid grid-cols-[1fr_auto] items-center gap-3"
                key={line.productId}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-neutral-500">
                    {formatVnd(product.priceCents)} x {line.quantity}
                  </p>
                </div>
                <div className="flex h-9 items-center rounded-lg border border-neutral-200">
                  <button
                    aria-label={`Remove ${product.name}`}
                    className="flex h-9 w-9 items-center justify-center text-neutral-500 hover:text-amber-900"
                    onClick={() => onRemove(product.id)}
                    type="button"
                  >
                    <Minus size={15} aria-hidden />
                  </button>
                  <button
                    aria-label={`Add ${product.name}`}
                    className="flex h-9 w-9 items-center justify-center text-neutral-500 hover:text-amber-900"
                    onClick={() => onAdd(product.id)}
                    type="button"
                  >
                    <Plus size={15} aria-hidden />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 border-t border-neutral-200 pt-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-neutral-500">Total</span>
          <span className="text-lg font-semibold">{formatVnd(totalCents)}</span>
        </div>
        <button
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
            primaryButtonClass,
          )}
          disabled={!cartLines.length}
          onClick={onCheckout}
          type="button"
        >
          <WalletCards size={17} aria-hidden />
          Checkout
        </button>
      </div>
    </section>
  );
}

function MethodPanel({
  loading,
  methods,
  selectedMethodId,
  onSelect,
  onEnroll,
  onDelete,
}: {
  loading: boolean;
  methods: PaymentMethod[];
  selectedMethodId: string;
  onSelect: (id: string) => void;
  onEnroll: (type: PaymentMethodType) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <WalletCards size={18} aria-hidden />
          <h2 className="font-semibold">Payment</h2>
        </div>
        {loading && <Loader2 className="animate-spin text-neutral-400" size={16} />}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(methodCopy) as PaymentMethodType[]).map((type) => {
          const copy = methodCopy[type];
          const Icon = copy.icon;
          const method = methods.find((item) => item.type === type);
          const selected = method?.id === selectedMethodId;
          const enrolled = Boolean(method);

          return (
            <div
              className={cn(
                "relative min-h-32 rounded-lg border p-3 transition",
                selected
                  ? primarySelectedClass
                  : enrolled
                    ? "border-neutral-200 bg-white hover:border-amber-200"
                    : "border-dashed border-neutral-200 bg-neutral-50/80 hover:border-amber-200 hover:bg-amber-50/50",
              )}
              key={type}
            >
              <button
                className="flex h-full w-full flex-col items-start pr-7 text-left"
                onClick={() => (method ? onSelect(method.id) : onEnroll(type))}
                type="button"
              >
                <span
                  className={cn(
                    "mb-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    selected
                      ? primaryIconClass
                      : enrolled
                        ? "bg-amber-100 text-amber-900"
                        : "border border-neutral-200 bg-white text-neutral-500",
                  )}
                >
                  <Icon size={17} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{copy.label}</span>
                  <span className="mt-1 block text-xs leading-4 text-neutral-500">
                    {copy.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-3 inline-flex h-6 items-center rounded-full px-2 text-xs font-medium",
                    selected
                      ? "bg-[#5a341f] text-white"
                      : enrolled
                        ? "bg-amber-50 text-amber-900"
                        : "border border-neutral-200 bg-white text-neutral-500",
                  )}
                >
                  {selected ? "Active" : enrolled ? "Added" : "Add"}
                </span>
              </button>
              {method && (
                <button
                  aria-label={`Remove ${copy.label}`}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white hover:text-red-600"
                  onClick={() => onDelete(method.id)}
                  type="button"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OrdersPanel({ orders }: { orders: Order[] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ReceiptText size={18} aria-hidden />
        <h2 className="font-semibold">Recent</h2>
      </div>
      <div className="space-y-2">
        {orders.length === 0 ? (
          <p className="text-sm text-neutral-500">No payments yet</p>
        ) : (
          orders.slice(0, 4).map((order) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2"
              key={order.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {methodCopy[order.paymentMethodType].label}
                </p>
                <p className="text-xs text-neutral-500">
                  {order.authorizationCode}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold">
                {formatVnd(order.totalCents)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function CheckoutPanel({
  cartLines,
  selectedMethod,
  totalCents,
  onBack,
  onPay,
}: {
  cartLines: CartLine[];
  selectedMethod?: PaymentMethod;
  totalCents: number;
  onBack: () => void;
  onPay: () => void;
}) {
  const Icon = selectedMethod ? methodCopy[selectedMethod.type].icon : WalletCards;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Checkout</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Review order and authorize payment.
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          onClick={onBack}
          type="button"
        >
          Back
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {cartLines.map((line) => {
            const product = getProduct(line.productId);
            if (!product) return null;

            return (
              <div
                className="grid grid-cols-[1fr_auto] gap-4 rounded-lg border border-neutral-200 px-4 py-3"
                key={line.productId}
              >
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-neutral-500">
                    {line.quantity} x {formatVnd(product.priceCents)}
                  </p>
                </div>
                <p className="font-semibold">
                  {formatVnd(product.priceCents * line.quantity)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="mb-4 flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                primaryIconClass,
              )}
            >
              <Icon size={18} aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {selectedMethod?.label ?? "No method"}
              </p>
              <p className="text-xs text-neutral-500">
                {selectedMethod
                  ? methodCopy[selectedMethod.type].description
                  : "Add one to continue"}
              </p>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between border-t border-neutral-200 pt-4">
            <span className="text-sm text-neutral-500">Total</span>
            <span className="text-xl font-semibold">{formatVnd(totalCents)}</span>
          </div>
          <button
            className={cn(
              "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              primaryButtonClass,
            )}
            disabled={!selectedMethod || !cartLines.length}
            onClick={onPay}
            type="button"
          >
            <ShieldCheck size={17} aria-hidden />
            Pay now
          </button>
        </div>
      </div>
    </section>
  );
}

function ReceiptPanel({
  order,
  onNewOrder,
}: {
  order: Order;
  onNewOrder: () => void;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-amber-50 text-amber-900">
        <CircleCheck size={30} aria-hidden />
      </div>
      <h2 className="text-2xl font-semibold">Paid</h2>
      <p className="mt-2 text-sm text-neutral-500">
        {order.authorizationCode} through {methodCopy[order.paymentMethodType].label}
      </p>
      <p className="mt-5 text-3xl font-semibold">{formatVnd(order.totalCents)}</p>
      <button
        className={cn(
          "mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
          primaryButtonClass,
        )}
        onClick={onNewOrder}
        type="button"
      >
        <ShoppingBag size={17} aria-hidden />
        New order
      </button>
    </section>
  );
}

function EnrollmentDialog({
  mode,
  userId,
  onClose,
  onEnroll,
}: {
  mode: PaymentMethodType;
  userId: string;
  onClose: () => void;
  onEnroll: (
    type: PaymentMethodType,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const copy = methodCopy[mode];
  const Icon = copy.icon;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nfcStatus, setNfcStatus] = useState("Ready");

  const finish = async (metadata: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    try {
      await onEnroll(mode, metadata);
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : "Could not add method",
      );
    } finally {
      setBusy(false);
    }
  };

  const startNfc = async () => {
    const Reader = (window as NfcWindow).NDEFReader;
    if (!Reader) {
      setNfcStatus("NFC unavailable");
      return;
    }

    setNfcStatus("Waiting for tap");
    try {
      const reader = new Reader();
      reader.addEventListener(
        "reading",
        (event) => {
          void finish({
            serialHint: event.serialNumber ?? "ndef-token",
            enrollment: "web-nfc",
          });
        },
        { once: true },
      );
      reader.addEventListener(
        "readingerror",
        () => setNfcStatus("Try again"),
        { once: true },
      );
      await reader.scan();
    } catch {
      setNfcStatus("NFC blocked");
    }
  };

  return (
    <DialogFrame onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg",
            primaryIconClass,
          )}
        >
          <Icon size={21} aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{copy.label}</h2>
          <p className="text-sm text-neutral-500">Add payment method</p>
        </div>
      </div>

      {mode === "qr" && (
        <EnrollmentAction
          busy={busy}
          icon={QrCode}
          label="Link wallet"
          onClick={() =>
            finish({
              wallet: "demo-wallet",
              tokenized: true,
            })
          }
        />
      )}

      {mode === "nfc" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-600">
            {nfcStatus}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EnrollmentAction
              busy={busy}
              icon={Nfc}
              label="Tap card"
              onClick={startNfc}
            />
            <EnrollmentAction
              busy={busy}
              icon={CreditCard}
              label="Demo card"
              onClick={() =>
                finish({
                  last4: "4242",
                  enrollment: "tokenized-demo-card",
                })
              }
            />
          </div>
        </div>
      )}

      {mode === "face" && (
        <FaceCapture
          mode="enroll"
          userId={userId}
          onCancel={onClose}
          onEnrolled={(metadata) => finish(metadata)}
          onVerified={() => undefined}
        />
      )}

      {mode === "palm" && (
        <PalmScanner
          actionLabel="Enroll palm"
          mode="enroll"
          onComplete={(metadata) => finish(metadata)}
        />
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </DialogFrame>
  );
}

function EnrollmentAction({
  busy,
  icon: Icon,
  label,
  onClick,
}: {
  busy: boolean;
  icon: typeof QrCode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition",
        primaryButtonClass,
      )}
      disabled={busy}
      onClick={onClick}
      type="button"
    >
      {busy ? <Loader2 className="animate-spin" size={16} /> : <Icon size={16} />}
      {label}
    </button>
  );
}

function PaymentDialog({
  method,
  userId,
  totalCents,
  cartLines,
  onClose,
  onAuthorized,
}: {
  method: PaymentMethod;
  userId: string;
  totalCents: number;
  cartLines: CartLine[];
  onClose: () => void;
  onAuthorized: (trace: Record<string, unknown>) => Promise<void>;
}) {
  const copy = methodCopy[method.type];
  const Icon = copy.icon;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const authorize = async (trace: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await onAuthorized({
        ...trace,
        methodType: method.type,
        authorizedAt: new Date().toISOString(),
      });
    } catch (authorizeError) {
      setError(
        authorizeError instanceof Error
          ? authorizeError.message
          : "Payment failed",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogFrame onClose={busy ? undefined : onClose}>
      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg",
            primaryIconClass,
          )}
        >
          <Icon size={21} aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{copy.label}</h2>
          <p className="text-sm text-neutral-500">{formatVnd(totalCents)}</p>
        </div>
      </div>

      {method.type === "qr" && (
        <QrPayment
          busy={busy}
          cartLines={cartLines}
          totalCents={totalCents}
          onAuthorize={authorize}
        />
      )}

      {method.type === "nfc" && (
        <NfcPayment busy={busy} onAuthorize={authorize} />
      )}

      {method.type === "face" && (
        <FaceCapture
          mode="verify"
          userId={userId}
          onCancel={onClose}
          onEnrolled={() => undefined}
          onVerified={(trace) => authorize(trace)}
        />
      )}

      {method.type === "palm" && (
        <PalmScanner
          actionLabel="Scan palm"
          mode="verify"
          onComplete={(trace) => authorize(trace)}
        />
      )}

      {busy && (
        <div className="mt-3 inline-flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="animate-spin" size={15} />
          Finalizing
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </DialogFrame>
  );
}

function QrPayment({
  busy,
  totalCents,
  cartLines,
  onAuthorize,
}: {
  busy: boolean;
  totalCents: number;
  cartLines: CartLine[];
  onAuthorize: (trace: Record<string, unknown>) => void;
}) {
  const [nonce] = useState(() => crypto.randomUUID());
  const value = JSON.stringify({
    type: "palmpay.checkout",
    merchant: "PalmPay Store",
    currency: "VND",
    totalCents,
    items: cartLines,
    nonce,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-center rounded-lg border border-neutral-200 bg-white p-4">
        <QRCodeSVG value={value} size={220} level="M" />
      </div>
      <button
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
          primaryButtonClass,
        )}
        disabled={busy}
        onClick={() =>
          onAuthorize({
            channel: "qr",
            nonce,
            walletConfirmation: true,
          })
        }
        type="button"
      >
        <Check size={17} aria-hidden />
        Confirmed
      </button>
    </div>
  );
}

function NfcPayment({
  busy,
  onAuthorize,
}: {
  busy: boolean;
  onAuthorize: (trace: Record<string, unknown>) => void;
}) {
  const [status, setStatus] = useState("Ready");

  const scan = async () => {
    const Reader = (window as NfcWindow).NDEFReader;
    if (!Reader) {
      setStatus("Use demo tap");
      return;
    }

    setStatus("Waiting for tap");
    try {
      const reader = new Reader();
      reader.addEventListener(
        "reading",
        (event) => {
          onAuthorize({
            channel: "web-nfc",
            serialHint: event.serialNumber ?? "ndef-token",
          });
        },
        { once: true },
      );
      reader.addEventListener(
        "readingerror",
        () => setStatus("Try again"),
        { once: true },
      );
      await reader.scan();
    } catch {
      setStatus("NFC blocked");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50">
        <div className="text-center">
          <Nfc className="mx-auto mb-3 text-amber-900" size={44} />
          <p className="text-sm font-medium">{status}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
            primaryButtonClass,
          )}
          disabled={busy}
          onClick={scan}
          type="button"
        >
          <ScanLine size={17} aria-hidden />
          Tap
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:text-neutral-300"
          disabled={busy}
          onClick={() =>
            onAuthorize({
              channel: "nfc-demo",
              cardToken: "tok_demo_4242",
            })
          }
          type="button"
        >
          <CreditCard size={17} aria-hidden />
          Demo
        </button>
      </div>
    </div>
  );
}

function FaceCapture({
  mode,
  userId,
  onCancel,
  onEnrolled,
  onVerified,
}: {
  mode: "enroll" | "verify";
  userId: string;
  onCancel: () => void;
  onEnrolled: (metadata: Record<string, unknown>) => void;
  onVerified: (trace: Record<string, unknown>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceApiRef = useRef<FaceApi | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Camera off");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const loadModels = async () => {
    if (faceApiRef.current) {
      return faceApiRef.current;
    }

    const faceapi = await import("@vladmandic/face-api");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("/models/face-api"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models/face-api"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models/face-api"),
    ]);
    faceApiRef.current = faceapi;
    return faceapi;
  };

  const start = async () => {
    setLoading(true);
    setError("");
    setStatus("Starting camera");

    try {
      await loadModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
      setStatus("Ready");
    } catch {
      setError("Camera unavailable");
      setStatus("Camera off");
    } finally {
      setLoading(false);
    }
  };

  const capture = async () => {
    const faceapi = faceApiRef.current;
    const video = videoRef.current;
    if (!faceapi || !video) return;

    setLoading(true);
    setError("");
    setStatus("Matching");

    try {
      const result = await faceapi
        .detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.5,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!result) {
        throw new Error("No face detected");
      }

      const descriptor = Array.from(result.descriptor);
      const key = faceTemplateKey(userId);

      if (mode === "enroll") {
        localStorage.setItem(
          key,
          JSON.stringify({
            descriptor,
            createdAt: new Date().toISOString(),
          }),
        );
        onEnrolled({
          model: "@vladmandic/face-api",
          template: "local-browser",
          descriptorLength: descriptor.length,
        });
        return;
      }

      const stored = readFaceTemplate(userId);
      if (!stored) {
        throw new Error("Face is not enrolled on this browser");
      }

      const distance = euclideanDistance(stored.descriptor, descriptor);
      if (distance > 0.62) {
        throw new Error("Face did not match");
      }

      onVerified({
        channel: "face-api",
        distance: Number(distance.toFixed(4)),
        threshold: 0.62,
      });
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Could not capture face",
      );
      setStatus("Ready");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-neutral-200 bg-slate-900">
        <video
          className="aspect-video w-full object-cover"
          muted
          playsInline
          ref={videoRef}
        />
        <div className="pointer-events-none absolute inset-0 border-[10px] border-white/10" />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="text-sm text-neutral-600">{status}</span>
        {loading && <Loader2 className="animate-spin text-neutral-500" size={16} />}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100"
          onClick={onCancel}
          type="button"
        >
          <X size={17} aria-hidden />
          Cancel
        </button>
        {!ready ? (
          <button
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              primaryButtonClass,
            )}
            disabled={loading}
            onClick={start}
            type="button"
          >
            {loading ? <Loader2 className="animate-spin" size={17} /> : <ScanFace size={17} />}
            Start
          </button>
        ) : (
          <button
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              primaryButtonClass,
            )}
            disabled={loading}
            onClick={capture}
            type="button"
          >
            {loading ? <Loader2 className="animate-spin" size={17} /> : <BadgeCheck size={17} />}
            {mode === "enroll" ? "Save" : "Match"}
          </button>
        )}
      </div>
    </div>
  );
}

function PalmScanner({
  actionLabel,
  mode,
  onComplete,
}: {
  actionLabel: string;
  mode: "enroll" | "verify";
  onComplete: (metadata: Record<string, unknown>) => void;
}) {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [step, setStep] = useState(0);
  const steps =
    mode === "enroll"
      ? ["Scanner ready", "Palm aligned", "Vein pattern captured", "Token saved"]
      : ["Scanner ready", "Palm detected", "Vein pattern matched", "Token issued"];

  const start = () => {
    setRunning(true);
    setCompleted(false);
    setStep(0);
  };

  useEffect(() => {
    if (!running) return;

    if (step >= steps.length - 1) {
      const timeout = window.setTimeout(() => {
        setRunning(false);
        setCompleted(true);
        onComplete({
          scanner: "PalmPay Scanner",
          mode,
          liveness: true,
          template: mode === "enroll" ? "server-token" : undefined,
        });
      }, 650);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => setStep((current) => current + 1), 650);
    return () => window.clearTimeout(timeout);
  }, [mode, onComplete, running, step, steps.length]);

  return (
    <div className="space-y-4">
      <div className="flex aspect-video items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50">
        <div className="relative flex h-32 w-32 items-center justify-center rounded-lg border border-neutral-300 bg-white">
          <Hand size={64} strokeWidth={1.5} aria-hidden />
          <div className="absolute inset-x-5 top-1/2 h-px bg-amber-500" />
        </div>
      </div>
      <div className="grid gap-2">
        {steps.map((item, index) => {
          const isDone = index < step || (completed && index === steps.length - 1);
          const isActive = index <= step && running;

          return (
            <div
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm",
                isActive
                  ? primarySoftClass
                  : "border-neutral-200 bg-white text-neutral-500",
              )}
              key={item}
            >
              {isDone ? (
                <Check size={15} aria-hidden />
              ) : (
                <ScanLine size={15} aria-hidden />
              )}
              {item}
            </div>
          );
        })}
      </div>
      <button
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
          primaryButtonClass,
        )}
        disabled={running}
        onClick={start}
        type="button"
      >
        {running ? <Loader2 className="animate-spin" size={17} /> : <Hand size={17} />}
        {actionLabel}
      </button>
    </div>
  );
}

function DialogFrame({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/30 px-4 py-6">
      <section className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-lg border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="mb-2 flex justify-end">
          {onClose && (
            <button
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
              onClick={onClose}
              type="button"
            >
              <X size={17} aria-hidden />
            </button>
          )}
        </div>
        {children}
      </section>
    </div>
  );
}

function faceTemplateKey(userId: string) {
  return `palmpay.face-template.${userId}`;
}

function readFaceTemplate(userId: string) {
  const stored = localStorage.getItem(faceTemplateKey(userId));
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as { descriptor?: unknown };
    if (
      Array.isArray(parsed.descriptor) &&
      parsed.descriptor.every((value) => typeof value === "number")
    ) {
      return { descriptor: parsed.descriptor };
    }
  } catch {
    return null;
  }

  return null;
}

function euclideanDistance(a: number[], b: number[]) {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;

  const sum = a.reduce((total, value, index) => {
    const diff = value - b[index];
    return total + diff * diff;
  }, 0);

  return Math.sqrt(sum);
}
