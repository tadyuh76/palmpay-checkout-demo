"use client";

import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Download,
  Hand,
  Loader2,
  Minus,
  Nfc,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  ScanFace,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import surveyConfig from "@/data/survey-questions.json";
import { catalog, catalogCategories, formatVnd, getProduct } from "@/lib/catalog";
import type { CartLine, Product, ProductCategory } from "@/lib/types";

type Cart = Record<string, number>;
type StudyGroup = "QR_PIN" | "NFC_CARD" | "FACE_POS" | "PALM_VEIN";
type MainStage = "catalog" | "setup" | "checkout" | "payment" | "receipt";
type ResearchTab = "consent" | "pre" | "post" | "ranking" | "debrief" | "data";

type SurveyQuestion = {
  item_id: string;
  construct: string;
  text: string;
  scale_min?: number;
  scale_max?: number;
  type?: "select";
  options?: string[];
  reverse_scored: boolean;
  required: boolean;
};

type EventLog = {
  event_name: string;
  timestamp: string;
  participant_id: string;
  transaction_id?: string;
  screen_name: string;
  metadata: Record<string, unknown>;
};

type TransactionRecord = {
  transaction_id: string;
  participant_id: string;
  method: StudyGroup;
  items: CartLine[];
  product_summary: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  setup_duration: number | null;
  checkout_duration: number | null;
  number_of_retries: number;
  number_of_errors: number;
  assistance_required: boolean;
  payment_status: "paid" | "technical_failure";
};

type ExperimentSession = {
  participant_id: string;
  protocol_version: string;
  assigned_group: StudyGroup;
  created_at: string;
  consent_at: string | null;
  pre_survey_completed_at: string | null;
  post_survey_completed_at: string | null;
  session_status: "active" | "completed" | "technical_failure";
  qr_pin?: string;
  biometric_consent_at?: string | null;
  setup_started_at?: string | null;
  setup_completed_at?: string | null;
  checkout_started_at?: string | null;
  checkout_completed_at?: string | null;
  transaction?: TransactionRecord | null;
  pre_answers: Record<string, string | number>;
  post_answers: Record<string, string | number>;
  ranking: Partial<Record<StudyGroup, number>>;
  open_feedback: {
    liked_most: string;
    biggest_concern: string;
    use_context: string;
  };
  events: EventLog[];
};

type AssignmentHistoryItem = {
  participant_id: string;
  assigned_group: StudyGroup;
  assigned_at: string;
};

const protocolVersion = "PALMPAY-POS-2026.06";
const startingBalance = 100000;
const groupOrder: StudyGroup[] = ["QR_PIN", "NFC_CARD", "FACE_POS", "PALM_VEIN"];
const categoryOptions: Array<ProductCategory | "All"> = ["All", ...catalogCategories];
const preQuestions = surveyConfig.pre as SurveyQuestion[];
const postQuestions = surveyConfig.post as SurveyQuestion[];

const storageKeys = {
  currentSession: "palmpay.pos.currentSession",
  completedSessions: "palmpay.pos.completedSessions",
  participantCounter: "palmpay.pos.participantCounter",
  assignmentQueue: "palmpay.pos.assignmentQueue",
  assignmentHistory: "palmpay.pos.assignmentHistory",
  interviewContacts: "palmpay.pos.interviewContacts",
};

const groupCopy: Record<
  StudyGroup,
  {
    label: string;
    shortLabel: string;
    device: string;
    neutralDescription: string;
    instruction: string;
    checkoutPrompt: string;
    icon: typeof QrCode;
    color: string;
  }
> = {
  QR_PIN: {
    label: "QR + mã PIN",
    shortLabel: "QR + PIN",
    device: "Điện thoại DemoBank",
    neutralDescription:
      "Quét mã QR của cửa hàng bằng ứng dụng DemoBank, kiểm tra số tiền và xác nhận bằng mã PIN thử nghiệm.",
    instruction:
      "Mở DemoBank, tạo mã PIN thử nghiệm, sau đó dùng QR tại POS khi thanh toán.",
    checkoutPrompt: "Quét QR bằng DemoBank",
    icon: QrCode,
    color: "border-sky-200 bg-sky-50 text-sky-900",
  },
  NFC_CARD: {
    label: "Thẻ NFC không tiếp xúc",
    shortLabel: "NFC card",
    device: "Thẻ NFC + đầu đọc",
    neutralDescription:
      "Chạm thẻ NFC thử nghiệm đã liên kết với phiên vào đầu đọc tại điểm bán.",
    instruction:
      "Liên kết thẻ NFC thử nghiệm với phiên. Giao dịch giá trị nhỏ không yêu cầu PIN.",
    checkoutPrompt: "Chạm thẻ NFC",
    icon: Nfc,
    color: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  FACE_POS: {
    label: "Nhận diện khuôn mặt tại POS",
    shortLabel: "Face POS",
    device: "Camera tại POS",
    neutralDescription:
      "Nhìn vào camera tại điểm bán để hệ thống đối chiếu với mẫu khuôn mặt đã đăng ký trong phiên.",
    instruction:
      "Đồng ý xử lý dữ liệu khuôn mặt và ghi ba mẫu trước khi thanh toán.",
    checkoutPrompt: "Nhìn vào camera POS",
    icon: ScanFace,
    color: "border-violet-200 bg-violet-50 text-violet-900",
  },
  PALM_VEIN: {
    label: "PalmPay tĩnh mạch lòng bàn tay",
    shortLabel: "PalmPay",
    device: "Máy quét PalmPay",
    neutralDescription:
      "Đưa lòng bàn tay qua máy quét để hệ thống đối chiếu mẫu tĩnh mạch đã đăng ký.",
    instruction:
      "Đồng ý xử lý dữ liệu lòng bàn tay và ghi ba mẫu trước khi thanh toán.",
    checkoutPrompt: "Đặt lòng bàn tay",
    icon: Hand,
    color: "border-amber-200 bg-amber-50 text-amber-900",
  },
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function nowIso() {
  return new Date().toISOString();
}

function formatSeconds(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function makeAssignmentBlocks(blockCount = 15) {
  return Array.from({ length: blockCount }).flatMap(() => shuffle(groupOrder));
}

function makeParticipantId() {
  const next = readJson<number>(storageKeys.participantCounter, 0) + 1;
  writeJson(storageKeys.participantCounter, next);
  return `P${String(next).padStart(4, "0")}`;
}

function getNextAssignment(participantId: string) {
  let queue = readJson<StudyGroup[]>(storageKeys.assignmentQueue, []);
  if (queue.length === 0) {
    queue = makeAssignmentBlocks();
  }

  const assigned = queue[0];
  writeJson(storageKeys.assignmentQueue, queue.slice(1));
  const history = readJson<AssignmentHistoryItem[]>(
    storageKeys.assignmentHistory,
    [],
  );
  writeJson(storageKeys.assignmentHistory, [
    ...history,
    {
      participant_id: participantId,
      assigned_group: assigned,
      assigned_at: nowIso(),
    },
  ]);

  return assigned;
}

function makeSession(): ExperimentSession {
  const participantId = makeParticipantId();
  const assignedGroup = getNextAssignment(participantId);
  const createdAt = nowIso();

  return {
    participant_id: participantId,
    protocol_version: protocolVersion,
    assigned_group: assignedGroup,
    created_at: createdAt,
    consent_at: null,
    pre_survey_completed_at: null,
    post_survey_completed_at: null,
    session_status: "active",
    biometric_consent_at: null,
    setup_started_at: null,
    setup_completed_at: null,
    checkout_started_at: null,
    checkout_completed_at: null,
    transaction: null,
    pre_answers: {},
    post_answers: {},
    ranking: {},
    open_feedback: {
      liked_most: "",
      biggest_concern: "",
      use_context: "",
    },
    events: [
      {
        event_name: "session_created",
        timestamp: createdAt,
        participant_id: participantId,
        screen_name: "research",
        metadata: { protocol_version: protocolVersion },
      },
      {
        event_name: "random_group_assigned",
        timestamp: createdAt,
        participant_id: participantId,
        screen_name: "research",
        metadata: { assigned_group: assignedGroup, block_randomized: true },
      },
    ],
  };
}

function isStudyGroup(value: unknown): value is StudyGroup {
  return (
    typeof value === "string" && groupOrder.includes(value as StudyGroup)
  );
}

function normalizeSession(value: ExperimentSession | null) {
  if (!value || !isStudyGroup(value.assigned_group)) {
    return makeSession();
  }

  return {
    ...value,
    protocol_version: value.protocol_version ?? protocolVersion,
    session_status: value.session_status ?? "active",
    consent_at: value.consent_at ?? null,
    pre_survey_completed_at: value.pre_survey_completed_at ?? null,
    post_survey_completed_at: value.post_survey_completed_at ?? null,
    biometric_consent_at: value.biometric_consent_at ?? null,
    setup_started_at: value.setup_started_at ?? null,
    setup_completed_at: value.setup_completed_at ?? null,
    checkout_started_at: value.checkout_started_at ?? null,
    checkout_completed_at: value.checkout_completed_at ?? null,
    transaction: value.transaction ?? null,
    events: Array.isArray(value.events) ? value.events : [],
    pre_answers: value.pre_answers ?? {},
    post_answers: value.post_answers ?? {},
    ranking: value.ranking ?? {},
    open_feedback: value.open_feedback ?? {
      liked_most: "",
      biggest_concern: "",
      use_context: "",
    },
  };
}

function summarizeCart(cartLines: CartLine[]) {
  return cartLines
    .map((line) => {
      const item = getProduct(line.productId);
      return item ? `${line.quantity}x ${item.name}` : null;
    })
    .filter(Boolean)
    .join(", ");
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildWideRow(session: ExperimentSession) {
  return {
    participant_id: session.participant_id,
    assigned_group: session.assigned_group,
    protocol_version: session.protocol_version,
    consent_at: session.consent_at,
    pre_survey_completed_at: session.pre_survey_completed_at,
    post_survey_completed_at: session.post_survey_completed_at,
    session_status: session.session_status,
    setup_duration: session.transaction?.setup_duration ?? null,
    checkout_duration: session.transaction?.checkout_duration ?? null,
    number_of_retries: session.transaction?.number_of_retries ?? 0,
    number_of_errors: session.transaction?.number_of_errors ?? 0,
    assistance_required: session.transaction?.assistance_required ?? false,
    payment_status: session.transaction?.payment_status ?? null,
    product_summary: session.transaction?.product_summary ?? "",
    amount: session.transaction?.amount ?? null,
    ...Object.fromEntries(
      Object.entries(session.pre_answers).map(([key, value]) => [`pre_${key}`, value]),
    ),
    ...Object.fromEntries(
      Object.entries(session.post_answers).map(([key, value]) => [
        `post_${key}`,
        value,
      ]),
    ),
    ...Object.fromEntries(
      groupOrder.map((group) => [`rank_${group}`, session.ranking[group] ?? ""]),
    ),
  };
}

function allStoredSessions(current?: ExperimentSession | null) {
  const completed = readJson<ExperimentSession[]>(
    storageKeys.completedSessions,
    [],
  );
  return current ? [...completed, current] : completed;
}

export function DemoApp() {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<ExperimentSession | null>(null);
  const [stage, setStage] = useState<MainStage>("catalog");
  const [cart, setCart] = useState<Cart>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProductCategory | "All">("All");
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchTab, setResearchTab] = useState<ResearchTab>("consent");

  useEffect(() => {
    window.queueMicrotask(() => {
      setSession(
        normalizeSession(
          readJson<ExperimentSession | null>(storageKeys.currentSession, null),
        ),
      );
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !session) return;
    writeJson(storageKeys.currentSession, session);
  }, [hydrated, session]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => ({ productId, quantity }))
        .filter((line) => line.quantity > 0 && getProduct(line.productId)),
    [cart],
  );

  const total = useMemo(
    () =>
      cartLines.reduce((sum, line) => {
        const item = getProduct(line.productId);
        return sum + (item?.priceCents ?? 0) * line.quantity;
      }, 0),
    [cartLines],
  );

  const methodReady = Boolean(session?.setup_completed_at);
  const canPay = cartLines.length > 0 && total > 0 && total <= startingBalance;

  const updateSession = (
    updater: (current: ExperimentSession) => ExperimentSession,
  ) => {
    setSession((current) => (current ? updater(current) : current));
  };

  const logEvent = (
    eventName: string,
    screenName: string,
    metadata: Record<string, unknown> = {},
  ) => {
    updateSession((current) => ({
      ...current,
      events: [
        ...current.events,
        {
          event_name: eventName,
          timestamp: nowIso(),
          participant_id: current.participant_id,
          transaction_id: current.transaction?.transaction_id,
          screen_name: screenName,
          metadata,
        },
      ],
    }));
  };

  const addToCart = (productId: string) => {
    setCart((current) => ({
      ...current,
      [productId]: Math.min((current[productId] ?? 0) + 1, 9),
    }));
    logEvent("product_added", "catalog", { product_id: productId });
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
    logEvent("product_removed", "catalog", { product_id: productId });
  };

  const startNewParticipant = () => {
    if (session?.transaction) {
      const completed = readJson<ExperimentSession[]>(
        storageKeys.completedSessions,
        [],
      );
      writeJson(storageKeys.completedSessions, [...completed, session]);
    }
    setSession(makeSession());
    setCart({});
    setStage("catalog");
    setResearchTab("consent");
  };

  const startSetup = () => {
    updateSession((current) => ({
      ...current,
      setup_started_at: current.setup_started_at ?? nowIso(),
      events: [
        ...current.events,
        {
          event_name: "setup_started",
          timestamp: nowIso(),
          participant_id: current.participant_id,
          screen_name: "setup",
          metadata: { assigned_group: current.assigned_group },
        },
      ],
    }));
    setStage("setup");
  };

  const finishSetup = (metadata: Record<string, unknown> = {}) => {
    updateSession((current) => ({
      ...current,
      setup_completed_at: nowIso(),
      events: [
        ...current.events,
        {
          event_name: "setup_completed",
          timestamp: nowIso(),
          participant_id: current.participant_id,
          screen_name: "setup",
          metadata,
        },
      ],
    }));
    setStage(cartLines.length ? "checkout" : "catalog");
  };

  const goCheckout = () => {
    if (!canPay) return;
    if (!methodReady) {
      startSetup();
      return;
    }
    setStage("checkout");
    logEvent("checkout_review_started", "checkout", {
      amount: total,
      items: cartLines,
    });
  };

  const startPayment = () => {
    if (!session || !canPay) return;
    const timestamp = nowIso();
    updateSession((current) => ({
      ...current,
      checkout_started_at: timestamp,
      transaction: {
        transaction_id: `TX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        participant_id: current.participant_id,
        method: current.assigned_group,
        items: cartLines,
        product_summary: summarizeCart(cartLines),
        amount: total,
        balance_before: startingBalance,
        balance_after: startingBalance - total,
        setup_duration: formatSeconds(
          current.setup_started_at,
          current.setup_completed_at,
        ),
        checkout_duration: null,
        number_of_retries: 0,
        number_of_errors: 0,
        assistance_required: false,
        payment_status: "paid",
      },
      events: [
        ...current.events,
        {
          event_name: "checkout_started",
          timestamp,
          participant_id: current.participant_id,
          screen_name: "checkout",
          metadata: { amount: total, items: cartLines },
        },
      ],
    }));
    setStage("payment");
  };

  const recordRetry = (errorCode: string) => {
    updateSession((current) => ({
      ...current,
      transaction: current.transaction
        ? {
            ...current.transaction,
            number_of_retries: current.transaction.number_of_retries + 1,
            number_of_errors: current.transaction.number_of_errors + 1,
          }
        : current.transaction,
      events: [
        ...current.events,
        {
          event_name: `${current.assigned_group.toLowerCase()}_error`,
          timestamp: nowIso(),
          participant_id: current.participant_id,
          transaction_id: current.transaction?.transaction_id,
          screen_name: "payment",
          metadata: { error_code: errorCode },
        },
      ],
    }));
  };

  const completePayment = (metadata: Record<string, unknown> = {}) => {
    updateSession((current) => {
      const timestamp = nowIso();
      return {
        ...current,
        checkout_completed_at: timestamp,
        transaction: current.transaction
          ? {
              ...current.transaction,
              checkout_duration: formatSeconds(current.checkout_started_at, timestamp),
              payment_status: "paid",
            }
          : current.transaction,
        events: [
          ...current.events,
          {
            event_name: "payment_completed",
            timestamp,
            participant_id: current.participant_id,
            transaction_id: current.transaction?.transaction_id,
            screen_name: "payment",
            metadata,
          },
        ],
      };
    });
    setStage("receipt");
  };

  const markTechnicalFailure = () => {
    updateSession((current) => {
      const timestamp = nowIso();
      return {
        ...current,
        session_status: "technical_failure",
        checkout_completed_at: timestamp,
        transaction: current.transaction
          ? {
              ...current.transaction,
              checkout_duration: formatSeconds(current.checkout_started_at, timestamp),
              payment_status: "technical_failure",
              assistance_required: true,
            }
          : current.transaction,
        events: [
          ...current.events,
          {
            event_name: "technical_failure_recorded",
            timestamp,
            participant_id: current.participant_id,
            transaction_id: current.transaction?.transaction_id,
            screen_name: "payment",
            metadata: { assigned_group: current.assigned_group },
          },
        ],
      };
    });
    setResearchTab("post");
    setResearchOpen(true);
  };

  if (!hydrated || !session) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-screen bg-[#f6efe5] text-stone-950">
      <AppHeader
        group={session.assigned_group}
        onNewParticipant={startNewParticipant}
        onResearch={() => setResearchOpen(true)}
        participantId={session.participant_id}
      />

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <StudyStrip
            group={session.assigned_group}
            methodReady={methodReady}
            onSetup={startSetup}
            stage={stage}
          />

          {stage === "catalog" && (
            <CatalogGrid
              cart={cart}
              category={category}
              onAdd={addToCart}
              onCategoryChange={setCategory}
              onQueryChange={setQuery}
              onRemove={removeFromCart}
              query={query}
            />
          )}

          {stage === "setup" && (
            <SetupPanel
              group={session.assigned_group}
              pin={session.qr_pin ?? ""}
              biometricConsentAt={session.biometric_consent_at}
              onConsent={() =>
                updateSession((current) => ({
                  ...current,
                  biometric_consent_at: nowIso(),
                  events: [
                    ...current.events,
                    {
                      event_name: "biometric_consent_completed",
                      timestamp: nowIso(),
                      participant_id: current.participant_id,
                      screen_name: "setup",
                      metadata: { method: current.assigned_group },
                    },
                  ],
                }))
              }
              onFinish={finishSetup}
              onLog={logEvent}
              onPinChange={(pin) =>
                updateSession((current) => ({ ...current, qr_pin: pin }))
              }
            />
          )}

          {stage === "checkout" && (
            <CheckoutPanel
              cartLines={cartLines}
              group={session.assigned_group}
              onBack={() => setStage("catalog")}
              onPay={startPayment}
              total={total}
            />
          )}

          {stage === "payment" && session.transaction && (
            <PaymentPanel
              group={session.assigned_group}
              onComplete={completePayment}
              onFailure={markTechnicalFailure}
              onLog={logEvent}
              onRetry={recordRetry}
              pin={session.qr_pin ?? ""}
              retries={session.transaction.number_of_retries}
              total={total}
              transactionId={session.transaction.transaction_id}
            />
          )}

          {stage === "receipt" && (
            <ReceiptPanel
              session={session}
              onNewOrder={() => {
                setCart({});
                setStage("catalog");
              }}
              onPostSurvey={() => {
                setResearchTab("post");
                setResearchOpen(true);
                logEvent("post_survey_opened", "research", { source: "receipt" });
              }}
            />
          )}
        </section>

        <aside className="space-y-5">
          <CartPanel
            cartLines={cartLines}
            methodReady={methodReady}
            onAdd={addToCart}
            onCheckout={goCheckout}
            onRemove={removeFromCart}
            total={total}
          />
          <MethodCard
            group={session.assigned_group}
            methodReady={methodReady}
            onSetup={startSetup}
            session={session}
          />
          <ResearchMiniCard
            consentDone={Boolean(session.consent_at)}
            onOpen={(tab) => {
              setResearchTab(tab);
              setResearchOpen(true);
            }}
            postDone={Boolean(session.post_survey_completed_at)}
            preDone={Boolean(session.pre_survey_completed_at)}
          />
        </aside>
      </div>

      {researchOpen && (
        <ResearchDrawer
          activeTab={researchTab}
          onClose={() => setResearchOpen(false)}
          onNewParticipant={startNewParticipant}
          onTab={setResearchTab}
          session={session}
          updateSession={updateSession}
        />
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6efe5]">
      <div className="inline-flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
        <Loader2 className="animate-spin" size={18} aria-hidden />
        Loading
      </div>
    </div>
  );
}

function AppHeader({
  group,
  onNewParticipant,
  onResearch,
  participantId,
}: {
  group: StudyGroup;
  onNewParticipant: () => void;
  onResearch: () => void;
  participantId: string;
}) {
  const Icon = groupCopy[group].icon;
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-[#fffaf3]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#5a341f] text-amber-50">
            <Hand size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">PalmPay Coffee</p>
            <p className="truncate text-xs text-stone-500">
              {participantId} · {protocolVersion}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold", groupCopy[group].color)}>
            <Icon size={16} aria-hidden />
            {groupCopy[group].shortLabel}
          </span>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            onClick={onResearch}
            type="button"
          >
            <Settings2 size={16} aria-hidden />
            Research
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            onClick={onNewParticipant}
            type="button"
          >
            <RotateCcw size={16} aria-hidden />
            New participant
          </button>
        </div>
      </div>
    </header>
  );
}

function StudyStrip({
  group,
  methodReady,
  onSetup,
  stage,
}: {
  group: StudyGroup;
  methodReady: boolean;
  onSetup: () => void;
  stage: MainStage;
}) {
  const Icon = groupCopy[group].icon;
  const steps: Array<{ key: MainStage; label: string }> = [
    { key: "catalog", label: "Menu" },
    { key: "setup", label: "Setup" },
    { key: "checkout", label: "Cart" },
    { key: "payment", label: "Pay" },
    { key: "receipt", label: "Receipt" },
  ];
  const activeIndex = steps.findIndex((item) => item.key === stage);

  return (
    <section className="mb-4 rounded-lg border border-stone-200 bg-[#fffaf3] p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#5a341f] text-amber-50">
            <Icon size={21} aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal">
              Coffee checkout experiment
            </h1>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Choose from the menu, then pay with the assigned method:
              {" "}
              <span className="font-semibold text-stone-900">
                {groupCopy[group].label}
              </span>
              .
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
          onClick={onSetup}
          type="button"
        >
          <ShieldCheck size={16} aria-hidden />
          {methodReady ? "Method ready" : "Setup method"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {steps.map((item, index) => (
          <div
            className={cn(
              "flex h-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold",
              index === activeIndex
                ? "border-amber-900 bg-[#5a341f] text-white"
                : index < activeIndex
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-stone-200 bg-white text-stone-500",
            )}
            key={item.key}
          >
            {item.label}
          </div>
        ))}
      </div>
    </section>
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
  const products = catalog.filter((item) => {
    const matchesCategory = category === "All" || item.category === category;
    const matchesQuery =
      !normalizedQuery ||
      [item.name, item.detail, item.category, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });

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
            className="h-11 w-full rounded-lg border border-stone-200 bg-[#fffaf3] pl-10 pr-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-amber-900 focus:ring-2 focus:ring-amber-100"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search coffee, pastries"
            value={query}
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:justify-end lg:pb-0">
          {categoryOptions.map((item) => (
            <button
              className={cn(
                "h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold transition",
                category === item
                  ? "border-amber-900 bg-[#5a341f] text-white"
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((item) => (
          <ProductCard
            key={item.id}
            onAdd={() => onAdd(item.id)}
            onRemove={() => onRemove(item.id)}
            product={item}
            quantity={cart[item.id] ?? 0}
          />
        ))}
      </div>
    </>
  );
}

function ProductCard({
  onAdd,
  onRemove,
  product,
  quantity,
}: {
  onAdd: () => void;
  onRemove: () => void;
  product: Product;
  quantity: number;
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
  methodReady,
  onAdd,
  onCheckout,
  onRemove,
  total,
}: {
  cartLines: CartLine[];
  methodReady: boolean;
  onAdd: (productId: string) => void;
  onCheckout: () => void;
  onRemove: (productId: string) => void;
  total: number;
}) {
  const overBalance = total > startingBalance;
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} aria-hidden />
          <h2 className="font-semibold">Order</h2>
        </div>
        <span className="text-sm text-stone-500">
          {cartLines.reduce((sum, item) => sum + item.quantity, 0)} items
        </span>
      </div>

      <div className="space-y-3">
        {cartLines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-200 px-3 py-8 text-center text-sm text-stone-500">
            Cart is empty
          </div>
        ) : (
          cartLines.map((line) => {
            const item = getProduct(line.productId);
            if (!item) return null;
            return (
              <div
                className="grid grid-cols-[1fr_auto] items-center gap-3"
                key={line.productId}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-stone-500">
                    {formatVnd(item.priceCents)} x {line.quantity}
                  </p>
                </div>
                <div className="flex h-9 items-center rounded-lg border border-stone-200">
                  <button
                    aria-label={`Remove ${item.name}`}
                    className="flex h-9 w-9 items-center justify-center text-stone-500 hover:text-amber-900"
                    onClick={() => onRemove(item.id)}
                    type="button"
                  >
                    <Minus size={15} aria-hidden />
                  </button>
                  <button
                    aria-label={`Add ${item.name}`}
                    className="flex h-9 w-9 items-center justify-center text-stone-500 hover:text-amber-900"
                    onClick={() => onAdd(item.id)}
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

      <div className="mt-4 border-t border-stone-200 pt-4">
        <Row label="Test balance" value={formatVnd(startingBalance)} />
        <Row label="Total" strong value={formatVnd(total)} />
        <Row
          label="After payment"
          value={overBalance ? "Over balance" : formatVnd(startingBalance - total)}
        />
        <button
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-4 text-sm font-semibold text-white transition hover:bg-[#432615] disabled:bg-stone-300"
          disabled={!cartLines.length || overBalance}
          onClick={onCheckout}
          type="button"
        >
          <WalletCards size={17} aria-hidden />
          {methodReady ? "Checkout" : "Setup & checkout"}
        </button>
      </div>
    </section>
  );
}

function MethodCard({
  group,
  methodReady,
  onSetup,
  session,
}: {
  group: StudyGroup;
  methodReady: boolean;
  onSetup: () => void;
  session: ExperimentSession;
}) {
  const Icon = groupCopy[group].icon;
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <WalletCards size={18} aria-hidden />
          <h2 className="font-semibold">Assigned method</h2>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-xs font-semibold",
            methodReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
          )}
        >
          {methodReady ? "Ready" : "Setup needed"}
        </span>
      </div>

      <div className={cn("rounded-lg border p-3", groupCopy[group].color)}>
        <Icon className="mb-3" size={24} aria-hidden />
        <p className="text-sm font-semibold">{groupCopy[group].label}</p>
        <p className="mt-1 text-xs leading-5 opacity-80">{groupCopy[group].device}</p>
      </div>

      <div className="mt-3 space-y-2 text-sm text-stone-600">
        <Row label="Participant" value={session.participant_id} />
        <Row label="Setup time" value={methodReady ? "Captured" : "Pending"} />
      </div>

      <button
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
        onClick={onSetup}
        type="button"
      >
        <ShieldCheck size={16} aria-hidden />
        {methodReady ? "Review setup" : "Setup method"}
      </button>
    </section>
  );
}

function ResearchMiniCard({
  consentDone,
  onOpen,
  postDone,
  preDone,
}: {
  consentDone: boolean;
  onOpen: (tab: ResearchTab) => void;
  postDone: boolean;
  preDone: boolean;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardCheck size={18} aria-hidden />
        <h2 className="font-semibold">Research forms</h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniFormButton done={consentDone} label="Consent" onClick={() => onOpen("consent")} />
        <MiniFormButton done={preDone} label="Pre" onClick={() => onOpen("pre")} />
        <MiniFormButton done={postDone} label="Post" onClick={() => onOpen("post")} />
        <MiniFormButton done={false} label="Rank" onClick={() => onOpen("ranking")} />
      </div>
      <button
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
        onClick={() => onOpen("data")}
        type="button"
      >
        <Download size={16} aria-hidden />
        Export
      </button>
    </section>
  );
}

function MiniFormButton({
  done,
  label,
  onClick,
}: {
  done: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition",
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100",
      )}
      onClick={onClick}
      type="button"
    >
      {done ? <Check size={15} aria-hidden /> : null}
      {label}
    </button>
  );
}

function SetupPanel({
  biometricConsentAt,
  group,
  onConsent,
  onFinish,
  onLog,
  onPinChange,
  pin,
}: {
  biometricConsentAt?: string | null;
  group: StudyGroup;
  onConsent: () => void;
  onFinish: (metadata?: Record<string, unknown>) => void;
  onLog: (eventName: string, screenName: string, metadata?: Record<string, unknown>) => void;
  onPinChange: (pin: string) => void;
  pin: string;
}) {
  const [samples, setSamples] = useState(0);
  const [linked, setLinked] = useState(false);
  const [bankOpened, setBankOpened] = useState(false);
  const needsBiometricConsent = group === "FACE_POS" || group === "PALM_VEIN";
  const biometricReady = !needsBiometricConsent || Boolean(biometricConsentAt);
  const done =
    group === "QR_PIN"
      ? bankOpened && /^\d{4}$/.test(pin)
      : group === "NFC_CARD"
        ? linked
        : biometricReady && samples >= 3;

  const capture = () => {
    const next = Math.min(samples + 1, 3);
    setSamples(next);
    onLog(
      group === "FACE_POS" ? "face_sample_captured" : "palm_sample_captured",
      "setup",
      { sample_number: next, raw_image_stored: false },
    );
  };

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#5a341f] text-amber-50">
          {(() => {
            const Icon = groupCopy[group].icon;
            return <Icon size={21} aria-hidden />;
          })()}
        </div>
        <div>
          <p className="text-sm font-medium text-amber-900">Method setup</p>
          <h2 className="text-xl font-semibold">{groupCopy[group].label}</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            {groupCopy[group].instruction}
          </p>
        </div>
      </div>

      {group === "QR_PIN" && (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <PhoneMock
            balance={startingBalance}
            opened={bankOpened}
            onOpen={() => {
              setBankOpened(true);
              onLog("demo_bank_opened", "setup", {});
            }}
          />
          <div className="rounded-lg border border-stone-200 bg-[#fffaf3] p-4">
            <h3 className="font-semibold">Create test PIN</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              This PIN is only for the simulation. Do not use a real bank PIN.
            </p>
            <input
              className="mt-4 h-12 w-full max-w-xs rounded-lg border border-stone-200 bg-white px-3 text-lg font-semibold tracking-[0.2em] outline-none focus:border-amber-900 focus:ring-2 focus:ring-amber-100"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) =>
                onPinChange(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="0000"
              type="password"
              value={pin}
            />
          </div>
        </div>
      )}

      {group === "NFC_CARD" && (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <CreditCard className="mb-8" size={38} aria-hidden />
            <p className="text-sm font-medium">NFC TEST CARD</p>
            <p className="mt-2 text-2xl font-semibold">CARD-POS-042</p>
            <p className="mt-6 text-sm">Physical card, not phone</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-[#fffaf3] p-4">
            <h3 className="font-semibold">Link test card</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              The NFC group uses a physical card so it does not overlap with QR
              phone payment or phone biometrics.
            </p>
            <button
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-4 text-sm font-semibold text-white transition hover:bg-[#432615]"
              onClick={() => {
                setLinked(true);
                onLog("nfc_card_linked", "setup", { card_ref: "CARD-POS-042" });
              }}
              type="button"
            >
              <Nfc size={17} aria-hidden />
              Link card
            </button>
          </div>
        </div>
      )}

      {needsBiometricConsent && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <label className="flex items-start gap-3">
            <input
              checked={Boolean(biometricConsentAt)}
              className="mt-1 h-4 w-4"
              disabled={Boolean(biometricConsentAt)}
              onChange={onConsent}
              type="checkbox"
            />
            <span>
              I agree to create an encrypted template for this experiment
              session. Raw face or palm images are not stored.
            </span>
          </label>
        </div>
      )}

      {(group === "FACE_POS" || group === "PALM_VEIN") && (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <BiometricMock group={group} samples={samples} />
          <div className="rounded-lg border border-stone-200 bg-[#fffaf3] p-4">
            <h3 className="font-semibold">
              Capture three {group === "FACE_POS" ? "face" : "palm"} samples
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Setup timing is recorded separately from payment timing.
            </p>
            <button
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-4 text-sm font-semibold text-white transition hover:bg-[#432615] disabled:bg-stone-300"
              disabled={!biometricReady || samples >= 3}
              onClick={capture}
              type="button"
            >
              <ScanLine size={17} aria-hidden />
              Capture {Math.min(samples + 1, 3)}/3
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end border-t border-stone-200 pt-4">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-4 text-sm font-semibold text-white transition hover:bg-[#432615] disabled:bg-stone-300"
          disabled={!done}
          onClick={() =>
            onFinish({
              method: group,
              setup_samples: samples || undefined,
              qr_pin_created: group === "QR_PIN" ? true : undefined,
              nfc_card_ref: group === "NFC_CARD" ? "CARD-POS-042" : undefined,
            })
          }
          type="button"
        >
          Continue checkout
          <ArrowRight size={17} aria-hidden />
        </button>
      </div>
    </section>
  );
}

function PhoneMock({
  balance,
  onOpen,
  opened,
}: {
  balance: number;
  onOpen: () => void;
  opened: boolean;
}) {
  return (
    <div className="rounded-[28px] border-4 border-stone-900 bg-stone-950 p-3 shadow-sm">
      <div className="rounded-[20px] bg-stone-50 p-4">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-sm font-semibold">DemoBank</span>
          <Smartphone size={17} aria-hidden />
        </div>
        <p className="text-xs text-stone-500">Test balance</p>
        <p className="mt-1 text-2xl font-semibold">{formatVnd(balance)}</p>
        <button
          className="mt-8 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white disabled:bg-sky-200"
          disabled={opened}
          onClick={onOpen}
          type="button"
        >
          <QrCode size={16} aria-hidden />
          {opened ? "App opened" : "Open app"}
        </button>
      </div>
    </div>
  );
}

function BiometricMock({
  group,
  samples,
}: {
  group: StudyGroup;
  samples: number;
}) {
  const face = group === "FACE_POS";
  return (
    <div className="flex aspect-video items-center justify-center rounded-lg border border-stone-200 bg-stone-900 text-white">
      <div className="text-center">
        {face ? (
          <ScanFace className="mx-auto mb-4 text-violet-200" size={58} aria-hidden />
        ) : (
          <Hand className="mx-auto mb-4 text-amber-200" size={58} aria-hidden />
        )}
        <p className="text-sm font-semibold">
          {face ? "POS camera" : "PalmPay scanner"}
        </p>
        <p className="mt-1 text-xs text-stone-300">{samples}/3 samples</p>
      </div>
    </div>
  );
}

function CheckoutPanel({
  cartLines,
  group,
  onBack,
  onPay,
  total,
}: {
  cartLines: CartLine[];
  group: StudyGroup;
  onBack: () => void;
  onPay: () => void;
  total: number;
}) {
  const Icon = groupCopy[group].icon;
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Review order</h2>
          <p className="mt-1 text-sm text-stone-500">
            The POS will continue with the assigned method only.
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          onClick={onBack}
          type="button"
        >
          Back
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {cartLines.map((line) => {
            const item = getProduct(line.productId);
            if (!item) return null;
            return (
              <div
                className="grid grid-cols-[1fr_auto] gap-4 rounded-lg border border-stone-200 px-4 py-3"
                key={line.productId}
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-stone-500">
                    {line.quantity} x {formatVnd(item.priceCents)}
                  </p>
                </div>
                <p className="font-semibold">
                  {formatVnd(item.priceCents * line.quantity)}
                </p>
              </div>
            );
          })}
        </div>

        <div className={cn("rounded-lg border p-4", groupCopy[group].color)}>
          <div className="mb-4 flex items-center gap-3">
            <Icon size={22} aria-hidden />
            <div>
              <p className="text-sm font-semibold">{groupCopy[group].label}</p>
              <p className="text-xs opacity-75">{groupCopy[group].device}</p>
            </div>
          </div>
          <Row label="Total" strong value={formatVnd(total)} />
          <Row label="Remaining" value={formatVnd(startingBalance - total)} />
          <button
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-4 text-sm font-semibold text-white transition hover:bg-[#432615]"
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

function PaymentPanel({
  group,
  onComplete,
  onFailure,
  onLog,
  onRetry,
  pin,
  retries,
  total,
  transactionId,
}: {
  group: StudyGroup;
  onComplete: (metadata?: Record<string, unknown>) => void;
  onFailure: () => void;
  onLog: (eventName: string, screenName: string, metadata?: Record<string, unknown>) => void;
  onRetry: (errorCode: string) => void;
  pin: string;
  retries: number;
  total: number;
  transactionId: string;
}) {
  const [qrScanned, setQrScanned] = useState(false);
  const [pinAttempt, setPinAttempt] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = (metadata: Record<string, unknown>) => {
    setBusy(true);
    window.setTimeout(() => onComplete(metadata), 500);
  };

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#5a341f] text-amber-50">
          {(() => {
            const Icon = groupCopy[group].icon;
            return <Icon size={21} aria-hidden />;
          })()}
        </div>
        <div>
          <p className="text-sm font-medium text-amber-900">Payment</p>
          <h2 className="text-xl font-semibold">{groupCopy[group].checkoutPrompt}</h2>
          <p className="mt-1 text-sm text-stone-500">
            {transactionId} · {formatVnd(total)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-lg border border-stone-200 bg-[#fffaf3] p-4">
          {group === "QR_PIN" && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border border-stone-200 bg-white p-4">
                <QRCodeSVG
                  level="M"
                  size={210}
                  value={JSON.stringify({
                    merchant: "PalmPay Coffee",
                    transaction_id: transactionId,
                    amount: total,
                  })}
                />
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                DemoBank reads amount: <span className="font-semibold">{formatVnd(total)}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white disabled:bg-stone-300"
                  disabled={qrScanned}
                  onClick={() => {
                    setQrScanned(true);
                    onLog("qr_scanned", "payment", {
                      transaction_id: transactionId,
                      amount: total,
                    });
                  }}
                  type="button"
                >
                  <QrCode size={16} aria-hidden />
                  {qrScanned ? "QR scanned" : "Scan QR"}
                </button>
                <input
                  className="h-11 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-amber-900 focus:ring-2 focus:ring-amber-100"
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) =>
                    setPinAttempt(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="PIN"
                  type="password"
                  value={pinAttempt}
                />
              </div>
              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-4 text-sm font-semibold text-white transition hover:bg-[#432615] disabled:bg-stone-300"
                disabled={busy || !qrScanned}
                onClick={() => {
                  onLog("amount_submitted", "payment", {
                    amount_entered: total,
                    expected_amount: total,
                  });
                  if (pinAttempt !== pin) {
                    onRetry("pin_failed");
                    return;
                  }
                  finish({ channel: "qr_pin", amount_entered: total, pin_ok: true });
                }}
                type="button"
              >
                {busy ? <Loader2 className="animate-spin" size={17} /> : <BadgeCheck size={17} />}
                Confirm payment
              </button>
            </div>
          )}

          {group === "NFC_CARD" && (
            <TapPayment
              busy={busy}
              icon={Nfc}
              label="Tap physical NFC card"
              onComplete={() => finish({ channel: "nfc_card", card_ref: "CARD-POS-042" })}
              onLog={() => onLog("nfc_tapped", "payment", { card_ref: "CARD-POS-042" })}
            />
          )}

          {group === "FACE_POS" && (
            <TapPayment
              busy={busy}
              icon={ScanFace}
              label="Look at POS camera"
              onComplete={() =>
                finish({ channel: "face_pos", match_score: 0.93, threshold: 0.82 })
              }
              onLog={() => onLog("face_match_success", "payment", { threshold: 0.82 })}
            />
          )}

          {group === "PALM_VEIN" && (
            <TapPayment
              busy={busy}
              icon={Hand}
              label="Place palm over scanner"
              onComplete={() =>
                finish({ channel: "palm_vein", match_score: 0.96, threshold: 0.86 })
              }
              onLog={() => onLog("palm_match_success", "payment", { threshold: 0.86 })}
            />
          )}
        </div>

        <RetryPanel
          group={group}
          onFailure={onFailure}
          onRetry={onRetry}
          retries={retries}
        />
      </div>
    </section>
  );
}

function TapPayment({
  busy,
  icon: Icon,
  label,
  onComplete,
  onLog,
}: {
  busy: boolean;
  icon: typeof Nfc;
  label: string;
  onComplete: () => void;
  onLog: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-stone-200 bg-white">
        <div className="text-center">
          <Icon className="mx-auto mb-4 text-amber-900" size={60} aria-hidden />
          <p className="text-lg font-semibold">{label}</p>
        </div>
      </div>
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-4 text-sm font-semibold text-white transition hover:bg-[#432615] disabled:bg-stone-300"
        disabled={busy}
        onClick={() => {
          onLog();
          onComplete();
        }}
        type="button"
      >
        {busy ? <Loader2 className="animate-spin" size={17} /> : <ScanLine size={17} aria-hidden />}
        Simulate reader success
      </button>
    </div>
  );
}

function RetryPanel({
  group,
  onFailure,
  onRetry,
  retries,
}: {
  group: StudyGroup;
  onFailure: () => void;
  onRetry: (errorCode: string) => void;
  retries: number;
}) {
  const errors: Record<StudyGroup, Array<{ code: string; label: string }>> = {
    QR_PIN: [
      { code: "qr_scan_failed", label: "QR scan failed" },
      { code: "pin_failed", label: "Wrong PIN" },
    ],
    NFC_CARD: [
      { code: "nfc_read_error", label: "Card read error" },
      { code: "wrong_card", label: "Wrong card" },
    ],
    FACE_POS: [
      { code: "no_face", label: "No face" },
      { code: "multiple_faces", label: "Multiple faces" },
      { code: "face_no_match", label: "No match" },
      { code: "camera_disconnected", label: "Camera disconnected" },
    ],
    PALM_VEIN: [
      { code: "no_hand", label: "No hand" },
      { code: "bad_distance", label: "Bad distance" },
      { code: "palm_no_match", label: "No match" },
      { code: "scanner_disconnected", label: "Scanner disconnected" },
    ],
  };

  return (
    <aside className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={18} aria-hidden />
        <h3 className="font-semibold">Retries</h3>
      </div>
      <p className="text-sm leading-6 text-stone-600">
        Up to two retries are logged before technical failure.
      </p>
      <div className="mt-3 space-y-2">
        {errors[group].map((error) => (
          <button
            className="inline-flex h-10 w-full items-center justify-start gap-2 rounded-lg border border-stone-200 bg-white px-3 text-left text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:text-stone-300"
            disabled={retries >= 2}
            key={error.code}
            onClick={() => onRetry(error.code)}
            type="button"
          >
            {error.label}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
        Retry count: <span className="font-semibold">{retries}/2</span>
      </div>
      <button
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-40"
        disabled={retries < 2}
        onClick={onFailure}
        type="button"
      >
        Record technical failure
      </button>
    </aside>
  );
}

function ReceiptPanel({
  onNewOrder,
  onPostSurvey,
  session,
}: {
  onNewOrder: () => void;
  onPostSurvey: () => void;
  session: ExperimentSession;
}) {
  const transaction = session.transaction;
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-amber-50 text-amber-900">
        <CheckCircle2 size={30} aria-hidden />
      </div>
      <h2 className="text-2xl font-semibold">Payment successful</h2>
      <p className="mt-2 text-sm text-stone-500">
        {transaction?.transaction_id ?? "TX-XXXX"} · {groupCopy[session.assigned_group].label}
      </p>
      <p className="mt-5 text-3xl font-semibold">
        {formatVnd(transaction?.amount ?? 0)}
      </p>
      <div className="mx-auto mt-5 max-w-sm text-left">
        <Row label="Remaining balance" value={formatVnd(transaction?.balance_after ?? startingBalance)} />
        <Row label="Items" value={transaction?.product_summary ?? ""} />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-4 text-sm font-semibold text-white transition hover:bg-[#432615]"
          onClick={onNewOrder}
          type="button"
        >
          <ShoppingBag size={17} aria-hidden />
          New order
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          onClick={onPostSurvey}
          type="button"
        >
          <ClipboardCheck size={17} aria-hidden />
          Open post survey
        </button>
      </div>
    </section>
  );
}

function ResearchDrawer({
  activeTab,
  onClose,
  onNewParticipant,
  onTab,
  session,
  updateSession,
}: {
  activeTab: ResearchTab;
  onClose: () => void;
  onNewParticipant: () => void;
  onTab: (tab: ResearchTab) => void;
  session: ExperimentSession;
  updateSession: (updater: (current: ExperimentSession) => ExperimentSession) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-stone-950/30">
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-stone-200 bg-[#fffaf3] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
          <div>
            <p className="text-sm font-medium text-amber-900">Research panel</p>
            <h2 className="text-xl font-semibold">
              {session.participant_id} · {groupCopy[session.assigned_group].shortLabel}
            </h2>
          </div>
          <button
            aria-label="Close research panel"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-950"
            onClick={onClose}
            type="button"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-stone-200 p-3">
          {([
            ["consent", "Consent"],
            ["pre", "Pre"],
            ["post", "Post"],
            ["ranking", "Rank"],
            ["debrief", "Debrief"],
            ["data", "Data"],
          ] as Array<[ResearchTab, string]>).map(([tab, label]) => (
            <button
              className={cn(
                "h-9 shrink-0 rounded-lg px-3 text-sm font-semibold transition",
                activeTab === tab
                  ? "bg-[#5a341f] text-white"
                  : "bg-white text-stone-600 hover:bg-stone-100",
              )}
              key={tab}
              onClick={() => onTab(tab)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {activeTab === "consent" && (
            <ConsentMini session={session} updateSession={updateSession} />
          )}
          {activeTab === "pre" && (
            <SurveyMini
              answers={session.pre_answers}
              completedAt={session.pre_survey_completed_at}
              onAnswer={(itemId, value) =>
                updateSession((current) => ({
                  ...current,
                  pre_answers: { ...current.pre_answers, [itemId]: value },
                }))
              }
              onComplete={() =>
                updateSession((current) => ({
                  ...current,
                  pre_survey_completed_at: nowIso(),
                  events: [
                    ...current.events,
                    {
                      event_name: "pre_survey_completed",
                      timestamp: nowIso(),
                      participant_id: current.participant_id,
                      screen_name: "research",
                      metadata: { items: Object.keys(current.pre_answers).length },
                    },
                  ],
                }))
              }
              questions={preQuestions}
              title="Pre-survey"
            />
          )}
          {activeTab === "post" && (
            <SurveyMini
              answers={session.post_answers}
              completedAt={session.post_survey_completed_at}
              onAnswer={(itemId, value) =>
                updateSession((current) => ({
                  ...current,
                  post_answers: { ...current.post_answers, [itemId]: value },
                }))
              }
              onComplete={() =>
                updateSession((current) => ({
                  ...current,
                  post_survey_completed_at: nowIso(),
                  events: [
                    ...current.events,
                    {
                      event_name: "post_survey_completed",
                      timestamp: nowIso(),
                      participant_id: current.participant_id,
                      transaction_id: current.transaction?.transaction_id,
                      screen_name: "research",
                      metadata: { items: Object.keys(current.post_answers).length },
                    },
                  ],
                }))
              }
              questions={postQuestions}
              title="Post-survey"
            />
          )}
          {activeTab === "ranking" && (
            <RankingMini session={session} updateSession={updateSession} />
          )}
          {activeTab === "debrief" && (
            <DebriefMini session={session} updateSession={updateSession} />
          )}
          {activeTab === "data" && (
            <DataMini
              onNewParticipant={onNewParticipant}
              session={session}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function ConsentMini({
  session,
  updateSession,
}: {
  session: ExperimentSession;
  updateSession: (updater: (current: ExperimentSession) => ExperimentSession) => void;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="font-semibold">Consent</h3>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Academic study, no real money, participant may stop any time, data used
        for research only.
      </p>
      <button
        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-3 text-sm font-semibold text-white disabled:bg-stone-300"
        disabled={Boolean(session.consent_at)}
        onClick={() =>
          updateSession((current) => ({
            ...current,
            consent_at: nowIso(),
            events: [
              ...current.events,
              {
                event_name: "consent_completed",
                timestamp: nowIso(),
                participant_id: current.participant_id,
                screen_name: "research",
                metadata: {},
              },
            ],
          }))
        }
        type="button"
      >
        <Check size={16} aria-hidden />
        {session.consent_at ? "Consent recorded" : "Record consent"}
      </button>
    </section>
  );
}

function SurveyMini({
  answers,
  completedAt,
  onAnswer,
  onComplete,
  questions,
  title,
}: {
  answers: Record<string, string | number>;
  completedAt: string | null;
  onAnswer: (itemId: string, value: string | number) => void;
  onComplete: () => void;
  questions: SurveyQuestion[];
  title: string;
}) {
  const complete = questions.every(
    (question) => !question.required || answers[question.item_id] !== undefined,
  );

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{title}</h3>
          {completedAt && (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              Done
            </span>
          )}
        </div>
      </div>
      {questions.map((question) => (
        <div
          className="rounded-lg border border-stone-200 bg-white p-4"
          key={question.item_id}
        >
          <p className="text-sm font-semibold">{question.text}</p>
          <p className="mt-1 text-xs text-stone-500">
            {question.item_id} · {question.construct}
          </p>
          <div className="mt-3">
            {question.type === "select" ? (
              <label className="relative block">
                <select
                  className="h-10 w-full appearance-none rounded-lg border border-stone-200 bg-stone-50 px-3 pr-9 text-sm outline-none focus:border-amber-900 focus:ring-2 focus:ring-amber-100"
                  onChange={(event) => onAnswer(question.item_id, event.target.value)}
                  value={String(answers[question.item_id] ?? "")}
                >
                  <option value="" disabled>
                    Select answer
                  </option>
                  {question.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
                  size={16}
                  aria-hidden
                />
              </label>
            ) : (
              <Likert
                max={question.scale_max ?? 5}
                min={question.scale_min ?? 1}
                onChange={(value) => onAnswer(question.item_id, value)}
                value={
                  typeof answers[question.item_id] === "number"
                    ? Number(answers[question.item_id])
                    : null
                }
              />
            )}
          </div>
        </div>
      ))}
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-3 text-sm font-semibold text-white disabled:bg-stone-300"
        disabled={!complete || Boolean(completedAt)}
        onClick={onComplete}
        type="button"
      >
        <Check size={16} aria-hidden />
        {completedAt ? "Completed" : "Mark complete"}
      </button>
    </section>
  );
}

function Likert({
  max,
  min,
  onChange,
  value,
}: {
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number | null;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {values.map((item) => (
          <button
            className={cn(
              "h-10 rounded-lg border text-sm font-semibold transition",
              value === item
                ? "border-amber-900 bg-[#5a341f] text-white"
                : "border-stone-200 bg-stone-50 text-stone-700 hover:border-amber-300",
            )}
            key={item}
            onClick={() => onChange(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-500">
        <span>Strongly disagree</span>
        <span>Strongly agree</span>
      </div>
    </div>
  );
}

function RankingMini({
  session,
  updateSession,
}: {
  session: ExperimentSession;
  updateSession: (updater: (current: ExperimentSession) => ExperimentSession) => void;
}) {
  const usedRanks = Object.values(session.ranking);
  return (
    <section className="space-y-3">
      {groupOrder.map((group) => {
        const copy = groupCopy[group];
        const Icon = copy.icon;
        return (
          <article className="rounded-lg border border-stone-200 bg-white p-4" key={group}>
            <div className="mb-3 flex items-start gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", copy.color)}>
                <Icon size={18} aria-hidden />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{copy.label}</h3>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {copy.neutralDescription}
                </p>
              </div>
            </div>
            <label className="relative block">
              <select
                className="h-10 w-full appearance-none rounded-lg border border-stone-200 bg-stone-50 px-3 pr-9 text-sm outline-none focus:border-amber-900 focus:ring-2 focus:ring-amber-100"
                onChange={(event) =>
                  updateSession((current) => ({
                    ...current,
                    ranking: {
                      ...current.ranking,
                      [group]: Number(event.target.value),
                    },
                  }))
                }
                value={session.ranking[group] ?? ""}
              >
                <option value="" disabled>
                  Rank
                </option>
                {[1, 2, 3, 4].map((rank) => (
                  <option
                    disabled={usedRanks.includes(rank) && session.ranking[group] !== rank}
                    key={rank}
                    value={rank}
                  >
                    Rank {rank}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
                size={16}
                aria-hidden
              />
            </label>
          </article>
        );
      })}
      <TextArea
        label="Liked most"
        onChange={(value) =>
          updateSession((current) => ({
            ...current,
            open_feedback: { ...current.open_feedback, liked_most: value },
          }))
        }
        value={session.open_feedback.liked_most}
      />
      <TextArea
        label="Biggest concern"
        onChange={(value) =>
          updateSession((current) => ({
            ...current,
            open_feedback: { ...current.open_feedback, biggest_concern: value },
          }))
        }
        value={session.open_feedback.biggest_concern}
      />
    </section>
  );
}

function DebriefMini({
  session,
  updateSession,
}: {
  session: ExperimentSession;
  updateSession: (updater: (current: ExperimentSession) => ExperimentSession) => void;
}) {
  const biometric =
    session.assigned_group === "FACE_POS" || session.assigned_group === "PALM_VEIN";
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-600">
      <h3 className="font-semibold text-stone-950">Debrief</h3>
      <p className="mt-2">
        This session compares checkout experience across QR + PIN, NFC card,
        face recognition at POS, and PalmPay palm-vein recognition.
      </p>
      {biometric && (
        <button
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-3 text-sm font-semibold text-white disabled:bg-stone-300"
          disabled={session.session_status === "completed"}
          onClick={() =>
            updateSession((current) => {
              const timestamp = nowIso();
              return {
                ...current,
                session_status: "completed",
                events: [
                  ...current.events,
                  {
                    event_name: "biometric_template_deleted",
                    timestamp,
                    participant_id: current.participant_id,
                    transaction_id: current.transaction?.transaction_id,
                    screen_name: "research",
                    metadata: { method: current.assigned_group },
                  },
                ],
              };
            })
          }
          type="button"
        >
          <Check size={16} aria-hidden />
          Delete biometric template
        </button>
      )}
    </section>
  );
}

function DataMini({
  onNewParticipant,
  session,
}: {
  onNewParticipant: () => void;
  session: ExperimentSession;
}) {
  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="font-semibold">Export data</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Exports include the current session and any archived sessions stored
          in this browser.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5a341f] px-3 text-sm font-semibold text-white"
            onClick={() =>
              downloadCsv("palmpay-wide.csv", allStoredSessions(session).map(buildWideRow))
            }
            type="button"
          >
            <Download size={16} aria-hidden />
            Wide CSV
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            onClick={() =>
              downloadCsv(
                "palmpay-events.csv",
                allStoredSessions(session).flatMap((item) => item.events),
              )
            }
            type="button"
          >
            <ReceiptText size={16} aria-hidden />
            Event CSV
          </button>
        </div>
      </div>
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
        onClick={onNewParticipant}
        type="button"
      >
        <RotateCcw size={16} aria-hidden />
        Archive and new participant
      </button>
    </section>
  );
}

function Row({
  label,
  strong,
  value,
}: {
  label: string;
  strong?: boolean;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-stone-100 py-2 last:border-0">
      <span className="text-sm text-stone-500">{label}</span>
      <span className={cn("text-right text-sm", strong ? "font-semibold text-stone-950" : "font-medium text-stone-700")}>
        {value}
      </span>
    </div>
  );
}

function TextArea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block rounded-lg border border-stone-200 bg-white p-4">
      <span className="mb-2 block text-sm font-semibold text-stone-700">{label}</span>
      <textarea
        className="min-h-24 w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-amber-900 focus:ring-2 focus:ring-amber-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
