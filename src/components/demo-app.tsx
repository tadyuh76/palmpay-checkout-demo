"use client";

import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Download,
  Hand,
  IdCard,
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
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  TimerReset,
  UserPlus,
} from "lucide-react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import surveyConfig from "@/data/survey-questions.json";
import { catalog, catalogCategories, formatVnd, getProduct } from "@/lib/catalog";
import type { CartLine, Product, ProductCategory } from "@/lib/types";

type StudyGroup = "QR_PIN" | "NFC_CARD" | "FACE_POS" | "PALM_VEIN";
type Cart = Record<string, number>;
type StepKey =
  | "admin"
  | "consent"
  | "pre"
  | "assignment"
  | "setup"
  | "product"
  | "checkout"
  | "payment"
  | "success"
  | "post"
  | "ranking"
  | "debrief";

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
  screen_name: StepKey;
  metadata: Record<string, unknown>;
};

type TransactionRecord = {
  transaction_id: string;
  participant_id: string;
  method: StudyGroup;
  product: string;
  items: CartLine[];
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
  assigned_group: StudyGroup | null;
  created_at: string;
  consent_at: string | null;
  pre_survey_completed_at: string | null;
  post_survey_completed_at: string | null;
  session_status: "created" | "active" | "completed" | "technical_failure";
  current_step: StepKey;
  qr_pin?: string;
  biometric_consent_at?: string | null;
  template_ref?: string | null;
  template_deleted_at?: string | null;
  setup_started_at?: string | null;
  setup_completed_at?: string | null;
  checkout_started_at?: string | null;
  checkout_completed_at?: string | null;
  cart: Cart;
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
  override_reason?: string;
};

const protocolVersion = "PALMPAY-POS-2026.06";
const startingBalance = 100000;

const storageKeys = {
  currentSession: "palmpay.pos.currentSession",
  completedSessions: "palmpay.pos.completedSessions",
  participantCounter: "palmpay.pos.participantCounter",
  assignmentQueue: "palmpay.pos.assignmentQueue",
  assignmentHistory: "palmpay.pos.assignmentHistory",
  interviewContacts: "palmpay.pos.interviewContacts",
};

const groupOrder: StudyGroup[] = ["QR_PIN", "NFC_CARD", "FACE_POS", "PALM_VEIN"];
const categoryOptions: Array<ProductCategory | "All"> = ["All", ...catalogCategories];

const groupCopy: Record<
  StudyGroup,
  {
    label: string;
    shortLabel: string;
    device: string;
    neutralDescription: string;
    instruction: string;
    icon: typeof QrCode;
    color: string;
  }
> = {
  QR_PIN: {
    label: "Mã QR + mã PIN",
    shortLabel: "QR + PIN",
    device: "Điện thoại thử nghiệm",
    neutralDescription:
      "Người tham gia dùng ứng dụng DemoBank trên điện thoại thử nghiệm để quét mã QR của cửa hàng, nhập số tiền và xác nhận bằng mã PIN thử nghiệm.",
    instruction:
      "Mở DemoBank, quét mã QR của POS, nhập đúng số tiền và xác nhận bằng mã PIN thử nghiệm.",
    icon: QrCode,
    color: "bg-sky-50 text-sky-900 border-sky-200",
  },
  NFC_CARD: {
    label: "Thẻ không tiếp xúc NFC",
    shortLabel: "NFC card",
    device: "Thẻ NFC + đầu đọc",
    neutralDescription:
      "Người tham gia dùng thẻ NFC thử nghiệm đã liên kết với phiên để chạm vào đầu đọc tại điểm bán cho giao dịch giá trị nhỏ.",
    instruction:
      "Chạm thẻ NFC thử nghiệm vào đầu đọc khi POS yêu cầu. Giao dịch trong phiên không yêu cầu PIN.",
    icon: Nfc,
    color: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  FACE_POS: {
    label: "Nhận diện khuôn mặt tại điểm bán",
    shortLabel: "Face POS",
    device: "Camera tại POS",
    neutralDescription:
      "Người tham gia nhìn vào camera tại điểm bán để hệ thống đối chiếu với mẫu khuôn mặt đã đăng ký trong phiên thử nghiệm.",
    instruction:
      "Nhìn vào camera tại POS cho đến khi hệ thống xác nhận đúng một khuôn mặt và đối chiếu thành công.",
    icon: ScanFace,
    color: "bg-violet-50 text-violet-900 border-violet-200",
  },
  PALM_VEIN: {
    label: "Nhận diện tĩnh mạch lòng bàn tay PalmPay",
    shortLabel: "PalmPay",
    device: "Máy quét PalmPay",
    neutralDescription:
      "Người tham gia đưa lòng bàn tay qua máy quét PalmPay để hệ thống đối chiếu mẫu tĩnh mạch lòng bàn tay đã đăng ký.",
    instruction:
      "Đưa lòng bàn tay qua máy quét theo khoảng cách hướng dẫn cho đến khi mẫu được đối chiếu thành công.",
    icon: Hand,
    color: "bg-amber-50 text-amber-900 border-amber-200",
  },
};

const stepLabels: Record<StepKey, string> = {
  admin: "Quản trị",
  consent: "Đồng ý",
  pre: "Khảo sát trước",
  assignment: "Phân nhóm",
  setup: "Thiết lập",
  product: "Sản phẩm",
  checkout: "Xác nhận",
  payment: "Thanh toán",
  success: "Thành công",
  post: "Khảo sát sau",
  ranking: "Xếp hạng",
  debrief: "Giải thích",
};

const flowSteps: StepKey[] = [
  "consent",
  "pre",
  "assignment",
  "setup",
  "product",
  "checkout",
  "payment",
  "success",
  "post",
  "ranking",
  "debrief",
];

const preQuestions = surveyConfig.pre as SurveyQuestion[];
const postQuestions = surveyConfig.post as SurveyQuestion[];

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

function cartToLines(cart?: Cart | null): CartLine[] {
  return Object.entries(cart ?? {})
    .filter(([, quantity]) => quantity > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));
}

function lineTotal(line: CartLine) {
  return (getProduct(line.productId)?.priceCents ?? 0) * line.quantity;
}

function cartTotal(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

function cartCount(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function summarizeCart(lines: CartLine[]) {
  return lines
    .map((line) => {
      const item = getProduct(line.productId);
      return `${item?.name ?? line.productId} x${line.quantity}`;
    })
    .join("; ");
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

function makeParticipantId() {
  const current = readJson<number>(storageKeys.participantCounter, 0) + 1;
  writeJson(storageKeys.participantCounter, current);
  return `P${String(current).padStart(4, "0")}`;
}

function makeSession(): ExperimentSession {
  return {
    participant_id: makeParticipantId(),
    protocol_version: protocolVersion,
    assigned_group: null,
    created_at: nowIso(),
    consent_at: null,
    pre_survey_completed_at: null,
    post_survey_completed_at: null,
    session_status: "created",
    current_step: "consent",
    biometric_consent_at: null,
    template_ref: null,
    template_deleted_at: null,
    setup_started_at: null,
    setup_completed_at: null,
    checkout_started_at: null,
    checkout_completed_at: null,
    cart: {},
    transaction: null,
    pre_answers: {},
    post_answers: {},
    ranking: {},
    open_feedback: {
      liked_most: "",
      biggest_concern: "",
      use_context: "",
    },
    events: [],
  };
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
  const group = session.assigned_group;
  return {
    participant_id: session.participant_id,
    assigned_group: group,
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
    product_summary: session.transaction?.product ?? null,
    cart_items: session.transaction?.items
      ? JSON.stringify(session.transaction.items)
      : null,
    cart_total: session.transaction?.amount ?? null,
    template_deleted_at: session.template_deleted_at ?? null,
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
      groupOrder.map((item) => [`rank_${item}`, session.ranking[item] ?? ""]),
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
  const cartLines = useMemo(() => cartToLines(session?.cart), [session?.cart]);
  const totalCents = useMemo(() => cartTotal(cartLines), [cartLines]);

  useEffect(() => {
    window.queueMicrotask(() => {
      setSession(readJson<ExperimentSession | null>(storageKeys.currentSession, null));
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (session) {
      writeJson(storageKeys.currentSession, session);
    } else {
      window.localStorage.removeItem(storageKeys.currentSession);
    }
  }, [hydrated, session]);

  const updateSession = (
    updater: (current: ExperimentSession) => ExperimentSession,
  ) => {
    setSession((current) => (current ? updater(current) : current));
  };

  const logEvent = (
    eventName: string,
    screenName: StepKey,
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

  const setStep = (step: StepKey, metadata: Record<string, unknown> = {}) => {
    updateSession((current) => ({
      ...current,
      current_step: step,
      session_status: current.session_status === "created" ? "active" : current.session_status,
      events: [
        ...current.events,
        {
          event_name: `${step}_started`,
          timestamp: nowIso(),
          participant_id: current.participant_id,
          transaction_id: current.transaction?.transaction_id,
          screen_name: step,
          metadata,
        },
      ],
    }));
  };

  const startNewSession = () => {
    const next = makeSession();
    setSession({
      ...next,
      events: [
        {
          event_name: "session_created",
          timestamp: next.created_at,
          participant_id: next.participant_id,
          screen_name: "admin",
          metadata: { protocol_version: next.protocol_version },
        },
      ],
    });
  };

  const updateCart = (productId: string, delta: number) => {
    updateSession((current) => {
      const nextCart: Cart = { ...(current.cart ?? {}) };
      const nextQuantity = (nextCart[productId] ?? 0) + delta;

      if (nextQuantity <= 0) {
        delete nextCart[productId];
      } else {
        nextCart[productId] = nextQuantity;
      }

      return {
        ...current,
        cart: nextCart,
        events: [
          ...current.events,
          {
            event_name: delta > 0 ? "cart_item_added" : "cart_item_removed",
            timestamp: nowIso(),
            participant_id: current.participant_id,
            screen_name: "product",
            metadata: {
              product_id: productId,
              quantity: nextCart[productId] ?? 0,
            },
          },
        ],
      };
    });
  };

  const continueToCheckout = () => {
    if (cartLines.length === 0 || totalCents > startingBalance) return;
    setStep("checkout", {
      amount: totalCents,
      item_count: cartCount(cartLines),
      product_summary: summarizeCart(cartLines),
    });
  };

  const completeConsent = () => {
    updateSession((current) => ({
      ...current,
      consent_at: nowIso(),
      current_step: "pre",
      session_status: "active",
      events: [
        ...current.events,
        {
          event_name: "consent_completed",
          timestamp: nowIso(),
          participant_id: current.participant_id,
          screen_name: "consent",
          metadata: {},
        },
        {
          event_name: "pre_started",
          timestamp: nowIso(),
          participant_id: current.participant_id,
          screen_name: "pre",
          metadata: {},
        },
      ],
    }));
  };

  const completePreSurvey = () => {
    updateSession((current) => {
      const assignedGroup = current.assigned_group ?? getNextAssignment(current.participant_id);
      const timestamp = nowIso();
      return {
        ...current,
        assigned_group: assignedGroup,
        pre_survey_completed_at: timestamp,
        current_step: "assignment",
        events: [
          ...current.events,
          {
            event_name: "pre_survey_completed",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "pre",
            metadata: { items: Object.keys(current.pre_answers).length },
          },
          {
            event_name: "random_group_assigned",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "assignment",
            metadata: { assigned_group: assignedGroup, block_randomized: true },
          },
        ],
      };
    });
  };

  const startSetup = () => {
    updateSession((current) => ({
      ...current,
      current_step: "setup",
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
  };

  const finishSetup = (metadata: Record<string, unknown> = {}) => {
    updateSession((current) => ({
      ...current,
      current_step: "product",
      setup_completed_at: nowIso(),
      template_ref:
        current.assigned_group === "FACE_POS" || current.assigned_group === "PALM_VEIN"
          ? `tpl_${crypto.randomUUID().slice(0, 8)}`
          : current.template_ref,
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
  };

  const startCheckout = () => {
    updateSession((current) => {
      const selectedItems = cartToLines(current.cart);
      const amount = cartTotal(selectedItems);
      if (selectedItems.length === 0 || amount > startingBalance) {
        return current;
      }

      return {
        ...current,
        current_step: "payment",
        checkout_started_at: nowIso(),
        transaction: {
          transaction_id: `TX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          participant_id: current.participant_id,
          method: current.assigned_group ?? "QR_PIN",
          product: summarizeCart(selectedItems),
          items: selectedItems,
          amount,
          balance_before: startingBalance,
          balance_after: startingBalance - amount,
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
            timestamp: nowIso(),
            participant_id: current.participant_id,
            screen_name: "checkout",
            metadata: {
              amount,
              item_count: cartCount(selectedItems),
              product_summary: summarizeCart(selectedItems),
            },
          },
        ],
      };
    });
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
          event_name: `${current.assigned_group?.toLowerCase()}_error`,
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
        current_step: "success",
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
  };

  const markTechnicalFailure = () => {
    updateSession((current) => {
      const timestamp = nowIso();
      return {
        ...current,
        current_step: "post",
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
          {
            event_name: "post_survey_started",
            timestamp,
            participant_id: current.participant_id,
            transaction_id: current.transaction?.transaction_id,
            screen_name: "post",
            metadata: { opened_after: "technical_failure" },
          },
        ],
      };
    });
  };

  const completePostSurvey = () => {
    updateSession((current) => ({
      ...current,
      current_step: "ranking",
      post_survey_completed_at: nowIso(),
      events: [
        ...current.events,
        {
          event_name: "post_survey_completed",
          timestamp: nowIso(),
          participant_id: current.participant_id,
          transaction_id: current.transaction?.transaction_id,
          screen_name: "post",
          metadata: { items: Object.keys(current.post_answers).length },
        },
      ],
    }));
  };

  const finishExperiment = () => {
    updateSession((current) => {
      const timestamp = nowIso();
      const biometric =
        current.assigned_group === "FACE_POS" || current.assigned_group === "PALM_VEIN";
      const completedSession: ExperimentSession = {
        ...current,
        current_step: "debrief",
        session_status:
          current.session_status === "technical_failure" ? "technical_failure" : "completed",
        template_ref: biometric ? null : current.template_ref,
        template_deleted_at: biometric ? timestamp : current.template_deleted_at,
        events: [
          ...current.events,
          {
            event_name: "ranking_completed",
            timestamp,
            participant_id: current.participant_id,
            transaction_id: current.transaction?.transaction_id,
            screen_name: "ranking",
            metadata: { ranking: current.ranking },
          },
          ...(biometric
            ? [
                {
                  event_name: "biometric_template_deleted",
                  timestamp,
                  participant_id: current.participant_id,
                  transaction_id: current.transaction?.transaction_id,
                  screen_name: "debrief" as StepKey,
                  metadata: { method: current.assigned_group },
                },
              ]
            : []),
        ],
      };
      const completed = readJson<ExperimentSession[]>(
        storageKeys.completedSessions,
        [],
      );
      writeJson(storageKeys.completedSessions, [...completed, completedSession]);
      return completedSession;
    });
  };

  const resetCurrentSession = () => setSession(null);

  if (!hydrated) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <AdminHome onCreate={startNewSession} />;
  }

  const payableAmount = session.transaction?.amount ?? totalCents;

  return (
    <main className="min-h-screen bg-[#f6efe5] text-stone-950">
      <ExperimentHeader session={session} onReset={resetCurrentSession} />
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ProgressRail currentStep={session.current_step} group={session.assigned_group} />
        <section className="min-w-0">
          {session.current_step === "consent" && (
            <ConsentScreen onContinue={completeConsent} />
          )}
          {session.current_step === "pre" && (
            <SurveyScreen
              answers={session.pre_answers}
              eyebrow="Khảo sát trước trải nghiệm"
              onAnswer={(itemId, value) =>
                updateSession((current) => ({
                  ...current,
                  pre_answers: { ...current.pre_answers, [itemId]: value },
                }))
              }
              onSubmit={completePreSurvey}
              questions={preQuestions}
              title="Thông tin nền"
            />
          )}
          {session.current_step === "assignment" && session.assigned_group && (
            <AssignmentScreen group={session.assigned_group} onContinue={startSetup} />
          )}
          {session.current_step === "setup" && session.assigned_group && (
            <SetupScreen
              group={session.assigned_group}
              pin={session.qr_pin ?? ""}
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
              biometricConsentAt={session.biometric_consent_at}
            />
          )}
          {session.current_step === "product" && (
            <ProductScreen
              cart={session.cart ?? {}}
              cartLines={cartLines}
              onAdd={(productId) => updateCart(productId, 1)}
              onContinue={continueToCheckout}
              onRemove={(productId) => updateCart(productId, -1)}
              totalCents={totalCents}
            />
          )}
          {session.current_step === "checkout" && session.assigned_group && (
            <CheckoutScreen
              cartLines={cartLines}
              group={session.assigned_group}
              onPay={startCheckout}
              totalCents={totalCents}
            />
          )}
          {session.current_step === "payment" && session.assigned_group && (
            <PaymentScreen
              group={session.assigned_group}
              pin={session.qr_pin ?? ""}
              retries={session.transaction?.number_of_retries ?? 0}
              totalCents={payableAmount}
              transactionId={session.transaction?.transaction_id ?? ""}
              onComplete={completePayment}
              onFailure={markTechnicalFailure}
              onLog={logEvent}
              onRetry={recordRetry}
            />
          )}
          {session.current_step === "success" && (
            <SuccessScreen
              transaction={session.transaction}
              onContinue={() => {
                logEvent("post_survey_started", "post", { opened_after: "paid" });
                setStep("post");
              }}
            />
          )}
          {session.current_step === "post" && (
            <SurveyScreen
              answers={session.post_answers}
              eyebrow="Khảo sát sau trải nghiệm"
              onAnswer={(itemId, value) =>
                updateSession((current) => ({
                  ...current,
                  post_answers: { ...current.post_answers, [itemId]: value },
                }))
              }
              onSubmit={completePostSurvey}
              questions={postQuestions}
              title="Đánh giá phương thức vừa sử dụng"
            />
          )}
          {session.current_step === "ranking" && (
            <RankingScreen
              feedback={session.open_feedback}
              ranking={session.ranking}
              onFeedback={(field, value) =>
                updateSession((current) => ({
                  ...current,
                  open_feedback: { ...current.open_feedback, [field]: value },
                }))
              }
              onRanking={(group, rank) =>
                updateSession((current) => ({
                  ...current,
                  ranking: { ...current.ranking, [group]: rank },
                }))
              }
              onSubmit={finishExperiment}
              participantId={session.participant_id}
            />
          )}
          {session.current_step === "debrief" && (
            <DebriefScreen
              session={session}
              onExport={() =>
                downloadCsv("palmpay-wide.csv", allStoredSessions(session).map(buildWideRow))
              }
              onExportEvents={() =>
                downloadCsv(
                  "palmpay-events.csv",
                  allStoredSessions(session).flatMap((item) => item.events),
                )
              }
              onNew={resetCurrentSession}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6efe5]">
      <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <Loader2 className="animate-spin" size={18} aria-hidden />
        Loading
      </div>
    </div>
  );
}

function AdminHome({ onCreate }: { onCreate: () => void }) {
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([]);
  const [completed, setCompleted] = useState<ExperimentSession[]>([]);

  useEffect(() => {
    window.queueMicrotask(() => {
      setHistory(readJson<AssignmentHistoryItem[]>(storageKeys.assignmentHistory, []));
      setCompleted(readJson<ExperimentSession[]>(storageKeys.completedSessions, []));
    });
  }, []);

  const counts = groupOrder.map((group) => ({
    group,
    count: history.filter((item) => item.assigned_group === group).length,
  }));

  return (
    <main className="min-h-screen bg-[#f6efe5] px-4 py-5 text-stone-950 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#7a4a2a]">{protocolVersion}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">
                PalmPay Coffee Experiment
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Nền tảng mô phỏng thí nghiệm tại quầy cafe: người tham gia
                đi theo luồng nghiên cứu đầy đủ, chọn món từ catalog, rồi
                thanh toán bằng phương thức được phân nhóm ngẫu nhiên.
              </p>
            </div>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f]"
              onClick={onCreate}
              type="button"
            >
              <UserPlus size={17} aria-hidden />
              Tạo người tham gia mới
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {counts.map(({ group, count }) => {
              const copy = groupCopy[group];
              const Icon = copy.icon;
              return (
                <article
                  className={cn("rounded-lg border p-4", copy.color)}
                  key={group}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Icon size={20} aria-hidden />
                    <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold">
                      {count} người
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold">{copy.shortLabel}</h2>
                  <p className="mt-1 text-xs leading-5 opacity-80">{copy.device}</p>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Thiết bị</h2>
            <div className="mt-3 space-y-2 text-sm">
              {[
                "Điện thoại DemoBank",
                "Đầu đọc thẻ NFC",
                "Camera tại POS",
                "Máy quét PalmPay",
              ].map((item) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                  key={item}
                >
                  <span>{item}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#7a4a2a]">
                    <CheckCircle2 size={14} aria-hidden />
                    Sẵn sàng
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Xuất dữ liệu</h2>
            <div className="mt-3 grid gap-2">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                disabled={completed.length === 0}
                onClick={() => downloadCsv("palmpay-wide.csv", completed.map(buildWideRow))}
                type="button"
              >
                <Download size={16} aria-hidden />
                CSV dạng rộng
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                disabled={completed.length === 0}
                onClick={() =>
                  downloadCsv(
                    "palmpay-events.csv",
                    completed.flatMap((item) => item.events),
                  )
                }
                type="button"
              >
                <ReceiptText size={16} aria-hidden />
                CSV nhật ký
              </button>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ExperimentHeader({
  session,
  onReset,
}: {
  session: ExperimentSession;
  onReset: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#ead8bf] bg-[#fffaf3]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#6f3f24] text-white">
            <Hand size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">PalmPay Coffee Study</p>
            <p className="truncate text-xs text-slate-500">
              {session.participant_id} · {protocolVersion}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            Số dư: {formatVnd(startingBalance)}
          </span>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={onReset}
            type="button"
          >
            <RotateCcw size={16} aria-hidden />
            Quản trị
          </button>
        </div>
      </div>
    </header>
  );
}

function ProgressRail({
  currentStep,
  group,
}: {
  currentStep: StepKey;
  group: StudyGroup | null;
}) {
  const activeIndex = flowSteps.indexOf(currentStep);
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardCheck size={18} aria-hidden />
        <h2 className="font-semibold">Luồng thí nghiệm</h2>
      </div>
      <div className="space-y-2">
        {flowSteps.map((step, index) => {
          const active = step === currentStep;
          const done = activeIndex > index;
          return (
            <div
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm",
                active
                  ? "border-[#d8b88b] bg-[#fff3df] text-[#4f2f1c]"
                  : done
                    ? "border-slate-200 bg-slate-50 text-slate-500"
                    : "border-transparent text-slate-400",
              )}
              key={step}
            >
              {done ? <Check size={15} aria-hidden /> : <span className="h-2 w-2 rounded-full bg-current" />}
              {stepLabels[step]}
            </div>
          );
        })}
      </div>
      {group && (
        <div className={cn("mt-4 rounded-lg border p-3", groupCopy[group].color)}>
          <p className="text-xs font-medium uppercase">{group}</p>
          <p className="mt-1 text-sm font-semibold">{groupCopy[group].label}</p>
        </div>
      )}
    </aside>
  );
}

function ConsentScreen({ onContinue }: { onContinue: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Panel
      eyebrow="Đồng ý tham gia"
      icon={ShieldCheck}
      title="Thông tin nghiên cứu"
    >
      <div className="grid gap-3 text-sm leading-6 text-slate-600 sm:grid-cols-2">
        {[
          "Đây là nghiên cứu học thuật.",
          "Không sử dụng tiền thật hoặc tài khoản thật.",
          "Bạn có thể dừng tham gia bất kỳ lúc nào.",
          "Dữ liệu chỉ được sử dụng cho mục đích nghiên cứu.",
        ].map((item) => (
          <div
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
            key={item}
          >
            {item}
          </div>
        ))}
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <input
          checked={checked}
          className="mt-1 h-4 w-4"
          onChange={(event) => setChecked(event.target.checked)}
          type="checkbox"
        />
        <span>
          Tôi đã đọc thông tin trên và đồng ý tiếp tục trong phiên thử nghiệm
          này.
        </span>
      </label>
      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-slate-300"
          disabled={!checked}
          onClick={onContinue}
          type="button"
        >
          Tiếp tục
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
  );
}

function SurveyScreen({
  answers,
  eyebrow,
  onAnswer,
  onSubmit,
  questions,
  title,
}: {
  answers: Record<string, string | number>;
  eyebrow: string;
  onAnswer: (itemId: string, value: string | number) => void;
  onSubmit: () => void;
  questions: SurveyQuestion[];
  title: string;
}) {
  const complete = questions.every(
    (question) => !question.required || answers[question.item_id] !== undefined,
  );
  return (
    <Panel eyebrow={eyebrow} icon={ClipboardCheck} title={title}>
      <div className="space-y-4">
        {questions.map((question) => (
          <div
            className="rounded-lg border border-slate-200 bg-white p-4"
            key={question.item_id}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">
                  {question.text}
                </p>
              </div>
            </div>
            {question.type === "select" ? (
              <label className="relative block max-w-sm">
                <select
                  className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pr-9 text-sm outline-none transition focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                  onChange={(event) => onAnswer(question.item_id, event.target.value)}
                  value={String(answers[question.item_id] ?? "")}
                >
                  <option value="" disabled>
                    Chọn câu trả lời
                  </option>
                  {question.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
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
        ))}
      </div>
      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-slate-300"
          disabled={!complete}
          onClick={onSubmit}
          type="button"
        >
          Hoàn thành
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
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
              "h-11 rounded-lg border text-sm font-semibold transition",
              value === item
                ? "border-[#6f3f24] bg-[#6f3f24] text-white"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:border-[#c9955d]",
            )}
            key={item}
            onClick={() => onChange(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>Hoàn toàn không đồng ý</span>
        <span>Hoàn toàn đồng ý</span>
      </div>
    </div>
  );
}

function AssignmentScreen({
  group,
  onContinue,
}: {
  group: StudyGroup;
  onContinue: () => void;
}) {
  const copy = groupCopy[group];
  const Icon = copy.icon;
  return (
    <Panel eyebrow="Phân nhóm ngẫu nhiên" icon={IdCard} title="Phương thức được chỉ định">
      <div className={cn("rounded-lg border p-5", copy.color)}>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/70">
            <Icon size={24} aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium uppercase">{group}</p>
            <h2 className="mt-1 text-xl font-semibold">{copy.label}</h2>
            <p className="mt-2 text-sm leading-6 opacity-85">{copy.instruction}</p>
          </div>
        </div>
      </div>
      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f]"
          onClick={onContinue}
          type="button"
        >
          Thiết lập phương thức
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
  );
}

function SetupScreen({
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
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
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
      ? /^\d{4}$/.test(pin)
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
    <Panel eyebrow="Thiết lập phương thức" icon={groupCopy[group].icon} title={groupCopy[group].label}>
      {group === "QR_PIN" && (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <PhoneMock
            balance={startingBalance}
            opened={bankOpened}
            onOpen={() => {
              setBankOpened(true);
              onLog("demo_bank_opened", "setup", {});
            }}
          />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Tạo mã PIN thử nghiệm</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Mã này chỉ dùng trong phiên mô phỏng và không liên quan đến tài
              khoản ngân hàng thật.
            </p>
            <input
              className="mt-4 h-12 w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 text-lg font-semibold tracking-[0.2em] outline-none focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
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
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <CreditCard className="mb-8" size={38} aria-hidden />
            <p className="text-sm font-medium">NFC TEST CARD</p>
            <p className="mt-2 text-2xl font-semibold">CARD-POS-042</p>
            <p className="mt-6 text-sm">Không yêu cầu PIN trong phiên mô phỏng</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Liên kết thẻ thử nghiệm</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Thẻ vật lý được dùng để tránh chồng lấn với điện thoại ở nhóm QR
              hoặc nhận diện khuôn mặt trên điện thoại.
            </p>
            <button
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f]"
              onClick={() => {
                setLinked(true);
                onLog("nfc_card_linked", "setup", { card_ref: "CARD-POS-042" });
              }}
              type="button"
            >
              <Nfc size={17} aria-hidden />
              Liên kết thẻ
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
              Tôi đồng ý cho hệ thống tạo mẫu đặc trưng mã hóa cho phiên thử
              nghiệm. Hệ thống không lưu hình ảnh thô và mẫu sẽ được xóa khi
              kết thúc phiên.
            </span>
          </label>
        </div>
      )}

      {(group === "FACE_POS" || group === "PALM_VEIN") && (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <BiometricMock group={group} samples={samples} />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">
              Ghi nhận ba mẫu {group === "FACE_POS" ? "khuôn mặt" : "lòng bàn tay"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Thời gian thiết lập được tách riêng với thời gian thanh toán để
              các nhóm sinh trắc học không bị đánh giá bất lợi.
            </p>
            <button
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-slate-300"
              disabled={!biometricReady || samples >= 3}
              onClick={capture}
              type="button"
            >
              <ScanLine size={17} aria-hidden />
              Ghi mẫu {Math.min(samples + 1, 3)}/3
            </button>
          </div>
        </div>
      )}

      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-slate-300"
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
          Hoàn tất thiết lập
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
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
    <div className="rounded-[28px] border-4 border-slate-900 bg-slate-950 p-3 shadow-sm">
      <div className="rounded-[20px] bg-slate-50 p-4">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-sm font-semibold">DemoBank</span>
          <Smartphone size={17} aria-hidden />
        </div>
        <p className="text-xs text-slate-500">Số dư thử nghiệm</p>
        <p className="mt-1 text-2xl font-semibold">{formatVnd(balance)}</p>
        <button
          className="mt-8 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white disabled:bg-sky-200"
          disabled={opened}
          onClick={onOpen}
          type="button"
        >
          <QrCode size={16} aria-hidden />
          {opened ? "Đã mở ứng dụng" : "Mở ứng dụng"}
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
    <div className="flex aspect-video items-center justify-center rounded-lg border border-slate-200 bg-slate-900 text-white">
      <div className="text-center">
        {face ? (
          <Camera className="mx-auto mb-4 text-violet-200" size={58} aria-hidden />
        ) : (
          <Hand className="mx-auto mb-4 text-amber-200" size={58} aria-hidden />
        )}
        <p className="text-sm font-semibold">
          {face ? "Camera POS" : "PalmPay scanner"}
        </p>
        <p className="mt-1 text-xs text-slate-300">{samples}/3 mẫu đã ghi</p>
      </div>
    </div>
  );
}

function ProductScreen({
  cart,
  cartLines,
  onAdd,
  onContinue,
  onRemove,
  totalCents,
}: {
  cart: Cart;
  cartLines: CartLine[];
  onAdd: (productId: string) => void;
  onContinue: () => void;
  onRemove: (productId: string) => void;
  totalCents: number;
}) {
  const [category, setCategory] = useState<ProductCategory | "All">("All");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProducts = useMemo(
    () =>
      catalog.filter((item) => {
        const matchesCategory = category === "All" || item.category === category;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          [item.name, item.detail, item.category, ...item.tags]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);
        return matchesCategory && matchesQuery;
      }),
    [category, normalizedQuery],
  );
  const remaining = startingBalance - totalCents;
  const canContinue = cartLines.length > 0 && remaining >= 0;

  return (
    <Panel eyebrow="Mua hàng" icon={ShoppingBag} title="Chọn món tại quầy cafe">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border border-[#ead8bf] bg-[#fffaf3] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-stone-950">
                  Coffee catalog
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Chọn một hoặc nhiều món trong giới hạn số dư thử nghiệm.
                </p>
              </div>
              <label className="relative block w-full max-w-sm">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  size={16}
                  aria-hidden
                />
                <input
                  className="h-11 w-full rounded-lg border border-[#dcc6aa] bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm latte, croissant..."
                  value={query}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {categoryOptions.map((item) => (
                <button
                  className={cn(
                    "h-9 rounded-lg border px-3 text-sm font-semibold transition",
                    category === item
                      ? "border-[#6f3f24] bg-[#6f3f24] text-white"
                      : "border-[#dcc6aa] bg-white text-stone-700 hover:border-[#c9955d]",
                  )}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {visibleProducts.map((item) => (
              <ProductCard
                key={item.id}
                onAdd={() => onAdd(item.id)}
                onRemove={() => onRemove(item.id)}
                product={item}
                quantity={cart[item.id] ?? 0}
              />
            ))}
          </div>
        </div>

        <aside className="h-fit rounded-lg border border-[#dcc6aa] bg-[#fffaf3] p-4 shadow-sm xl:sticky xl:top-24">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-stone-950">Giỏ hàng</h3>
              <p className="mt-1 text-xs text-stone-500">
                {cartCount(cartLines)} món đã chọn
              </p>
            </div>
            <ShoppingBag className="text-[#7a4a2a]" size={22} aria-hidden />
          </div>

          {cartLines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#dcc6aa] bg-white px-3 py-6 text-center text-sm text-stone-500">
              Chưa có món nào trong giỏ hàng.
            </div>
          ) : (
            <div className="space-y-3">
              {cartLines.map((line) => {
                const item = getProduct(line.productId);
                if (!item) return null;
                return (
                  <div
                    className="rounded-lg border border-[#ead8bf] bg-white px-3 py-2"
                    key={line.productId}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-950">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {line.quantity} x {formatVnd(item.priceCents)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-stone-800">
                        {formatVnd(lineTotal(line))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 grid gap-2 text-sm">
            <Row label="Số dư ban đầu" value={formatVnd(startingBalance)} />
            <Row label="Tổng tiền" value={formatVnd(totalCents)} strong />
            <Row
              label="Số dư sau thanh toán"
              value={formatVnd(Math.max(remaining, 0))}
            />
          </div>
          {remaining < 0 && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              Tổng tiền vượt quá số dư thử nghiệm.
            </p>
          )}
        </aside>
      </div>
      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-stone-300"
          disabled={!canContinue}
          onClick={onContinue}
          type="button"
        >
          Xác nhận giỏ hàng
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
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
    <article className="overflow-hidden rounded-lg border border-[#ead8bf] bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-[#efe1cf]">
        <Image
          alt={product.imageAlt}
          className="object-cover"
          fill
          sizes="(min-width: 1024px) 340px, (min-width: 768px) 45vw, 92vw"
          src={product.image}
        />
        {product.popular && (
          <span className="absolute left-3 top-3 rounded-lg bg-[#fffaf3]/95 px-2 py-1 text-xs font-semibold text-[#6f3f24] shadow-sm">
            Popular
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#7a4a2a]">
              {product.category}
            </p>
            <h3 className="mt-1 text-base font-semibold text-stone-950">
              {product.name}
            </h3>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              {product.detail}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-stone-900">
            {formatVnd(product.priceCents)}
          </p>
        </div>
        <div className="flex h-10 items-center justify-between rounded-lg border border-[#dcc6aa] bg-[#fffaf3] px-2">
          <button
            aria-label={`Giảm ${product.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-700 transition hover:bg-white disabled:text-stone-300"
            disabled={quantity === 0}
            onClick={onRemove}
            type="button"
          >
            <Minus size={16} aria-hidden />
          </button>
          <span className="min-w-8 text-center text-sm font-semibold text-stone-950">
            {quantity}
          </span>
          <button
            aria-label={`Thêm ${product.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-[#6f3f24] text-white transition hover:bg-[#5a341f]"
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

function CheckoutScreen({
  cartLines,
  group,
  onPay,
  totalCents,
}: {
  cartLines: CartLine[];
  group: StudyGroup;
  onPay: () => void;
  totalCents: number;
}) {
  const copy = groupCopy[group];
  const Icon = copy.icon;
  const canPay = cartLines.length > 0 && totalCents <= startingBalance;
  return (
    <Panel eyebrow="Xác nhận đơn hàng" icon={ReceiptText} title="Giỏ hàng">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-[#ead8bf] bg-white p-4">
          <div className="space-y-3">
            {cartLines.map((line) => {
              const item = getProduct(line.productId);
              if (!item) return null;
              return (
                <div
                  className="flex items-start justify-between gap-4 rounded-lg border border-[#f0dfc8] bg-[#fffaf3] px-3 py-2"
                  key={line.productId}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-950">{item.name}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {line.quantity} x {formatVnd(item.priceCents)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-stone-800">
                    {formatVnd(lineTotal(line))}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <Row label="Số lượng món" value={String(cartCount(cartLines))} />
            <Row label="Số dư ban đầu" value={formatVnd(startingBalance)} />
            <Row label="Tổng tiền" value={formatVnd(totalCents)} strong />
            <Row
              label="Số dư sau thanh toán"
              value={formatVnd(startingBalance - totalCents)}
            />
          </div>
        </div>
        <div className={cn("rounded-lg border p-4", copy.color)}>
          <div className="mb-3 flex items-center gap-3">
            <Icon size={22} aria-hidden />
            <div>
              <p className="text-sm font-semibold">{copy.label}</p>
              <p className="text-xs opacity-75">{copy.device}</p>
            </div>
          </div>
          <p className="text-sm leading-6 opacity-85">
            POS sẽ chuyển thẳng sang phương thức đã được phân nhóm.
          </p>
        </div>
      </div>
      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-stone-300"
          disabled={!canPay}
          onClick={onPay}
          type="button"
        >
          Thanh toán
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
  );
}

function PaymentScreen({
  group,
  onComplete,
  onFailure,
  onLog,
  onRetry,
  pin,
  retries,
  totalCents,
  transactionId,
}: {
  group: StudyGroup;
  onComplete: (metadata?: Record<string, unknown>) => void;
  onFailure: () => void;
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
  onRetry: (errorCode: string) => void;
  pin: string;
  retries: number;
  totalCents: number;
  transactionId: string;
}) {
  const [qrStep, setQrStep] = useState<"start" | "scanned" | "confirmed">("start");
  const [amount, setAmount] = useState("");
  const [pinAttempt, setPinAttempt] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = (metadata: Record<string, unknown>) => {
    setBusy(true);
    window.setTimeout(() => onComplete(metadata), 600);
  };

  return (
    <Panel eyebrow="Thanh toán tại POS" icon={groupCopy[group].icon} title={groupCopy[group].label}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {group === "QR_PIN" && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border border-slate-200 bg-slate-50 p-4">
                <QRCodeSVG
                  level="M"
                  size={210}
                  value={JSON.stringify({
                    merchant: "PalmPay Lab Store",
                    transaction_id: transactionId,
                    amount: totalCents,
                  })}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white disabled:bg-slate-300"
                  disabled={qrStep !== "start"}
                  onClick={() => {
                    setQrStep("scanned");
                    onLog("qr_scanned", "payment", { transaction_id: transactionId });
                  }}
                  type="button"
                >
                  <QrCode size={16} aria-hidden />
                  Quét QR
                </button>
                <input
                  className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                  inputMode="numeric"
                  onChange={(event) =>
                    setAmount(event.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  placeholder={String(totalCents)}
                  value={amount}
                />
                <input
                  className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
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
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-slate-300"
                disabled={busy || qrStep === "start"}
                onClick={() => {
                  onLog("amount_submitted", "payment", {
                    amount_entered: Number(amount),
                    expected_amount: totalCents,
                  });
                  if (Number(amount) !== totalCents) {
                    onRetry("wrong_amount");
                    return;
                  }
                  if (pinAttempt !== pin) {
                    onRetry("pin_failed");
                    return;
                  }
                  setQrStep("confirmed");
                  finish({ channel: "qr_pin", amount_entered: Number(amount), pin_ok: true });
                }}
                type="button"
              >
                {busy ? <Loader2 className="animate-spin" size={17} /> : <BadgeCheck size={17} />}
                Xác nhận
              </button>
            </div>
          )}

          {group === "NFC_CARD" && (
            <TapPayment
              busy={busy}
              icon={Nfc}
              label="Vui lòng chạm thẻ"
              amount={totalCents}
              onComplete={() => finish({ channel: "nfc_card", card_ref: "CARD-POS-042" })}
              onLog={() => onLog("nfc_tapped", "payment", { card_ref: "CARD-POS-042" })}
            />
          )}

          {group === "FACE_POS" && (
            <TapPayment
              busy={busy}
              icon={ScanFace}
              label="Vui lòng nhìn vào camera"
              amount={totalCents}
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
              label="Vui lòng đặt lòng bàn tay"
              amount={totalCents}
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
      {qrStep === "confirmed" && (
        <p className="mt-4 text-sm font-medium text-[#7a4a2a]">DemoBank đã gửi trạng thái thành công về máy chủ.</p>
      )}
    </Panel>
  );
}

function TapPayment({
  amount,
  busy,
  icon: Icon,
  label,
  onComplete,
  onLog,
}: {
  amount: number;
  busy: boolean;
  icon: typeof Nfc;
  label: string;
  onComplete: () => void;
  onLog: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
        <div className="text-center">
          <Icon className="mx-auto mb-4 text-[#7a4a2a]" size={60} aria-hidden />
          <p className="text-lg font-semibold">{label}</p>
          <p className="mt-1 text-sm text-slate-500">{formatVnd(amount)}</p>
        </div>
      </div>
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-slate-300"
        disabled={busy}
        onClick={() => {
          onLog();
          onComplete();
        }}
        type="button"
      >
        {busy ? <Loader2 className="animate-spin" size={17} /> : <ScanLine size={17} aria-hidden />}
        Mô phỏng xác nhận
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
      { code: "wrong_amount", label: "Nhập sai số tiền" },
      { code: "pin_failed", label: "Nhập sai PIN" },
    ],
    NFC_CARD: [
      { code: "nfc_read_error", label: "Lỗi đọc thẻ" },
      { code: "wrong_card", label: "Thẻ không khớp phiên" },
    ],
    FACE_POS: [
      { code: "no_face", label: "Không phát hiện khuôn mặt" },
      { code: "multiple_faces", label: "Có nhiều khuôn mặt" },
      { code: "low_quality", label: "Hình ảnh không đủ chất lượng" },
      { code: "face_no_match", label: "Không khớp mẫu" },
      { code: "camera_disconnected", label: "Camera mất kết nối" },
    ],
    PALM_VEIN: [
      { code: "no_hand", label: "Không phát hiện bàn tay" },
      { code: "bad_distance", label: "Khoảng cách không phù hợp" },
      { code: "low_quality", label: "Mẫu không đủ chất lượng" },
      { code: "palm_no_match", label: "Không khớp mẫu" },
      { code: "scanner_disconnected", label: "Thiết bị mất kết nối" },
    ],
  };

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <TimerReset size={18} aria-hidden />
        <h3 className="font-semibold">Thử lại và lỗi</h3>
      </div>
      <p className="text-sm leading-6 text-slate-600">
        Tối đa hai lần thử lại. Sau đó hệ thống ghi nhận lỗi kỹ thuật và mở
        khảo sát sau trải nghiệm.
      </p>
      <div className="mt-3 space-y-2">
        {errors[group].map((error) => (
          <button
            className="inline-flex h-10 w-full items-center justify-start gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
            disabled={retries >= 2}
            key={error.code}
            onClick={() => onRetry(error.code)}
            type="button"
          >
            <AlertTriangle size={15} aria-hidden />
            {error.label}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Số lần thử lại: <span className="font-semibold">{retries}/2</span>
      </div>
      <button
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-40"
        disabled={retries < 2}
        onClick={onFailure}
        type="button"
      >
        Ghi nhận lỗi kỹ thuật
      </button>
    </aside>
  );
}

function SuccessScreen({
  onContinue,
  transaction,
}: {
  onContinue: () => void;
  transaction?: TransactionRecord | null;
}) {
  const paidAmount = transaction?.amount ?? 0;
  const balanceAfter = transaction?.balance_after ?? startingBalance - paidAmount;

  return (
    <Panel eyebrow="Kết quả giao dịch" icon={CheckCircle2} title="Thanh toán thành công">
      <div className="mx-auto max-w-lg rounded-lg border border-[#d8b88b] bg-[#fff3df] p-6 text-center text-[#4f2f1c]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-white/80">
          <CheckCircle2 size={32} aria-hidden />
        </div>
        <h2 className="text-2xl font-semibold">Thanh toán thành công</h2>
        <div className="mt-5 space-y-2 text-sm">
          <Row label="Đơn hàng" value={transaction?.product ?? "Coffee order"} />
          <Row label="Đã thanh toán" value={formatVnd(paidAmount)} />
          <Row label="Số dư còn lại" value={formatVnd(balanceAfter)} />
          <Row label="Mã giao dịch" value={transaction?.transaction_id ?? "TX-XXXX"} />
        </div>
      </div>
      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f]"
          onClick={onContinue}
          type="button"
        >
          Tiếp tục khảo sát
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
  );
}

function RankingScreen({
  feedback,
  onFeedback,
  onRanking,
  onSubmit,
  participantId,
  ranking,
}: {
  feedback: ExperimentSession["open_feedback"];
  onFeedback: (field: keyof ExperimentSession["open_feedback"], value: string) => void;
  onRanking: (group: StudyGroup, rank: number) => void;
  onSubmit: () => void;
  participantId: string;
  ranking: Partial<Record<StudyGroup, number>>;
}) {
  const usedRanks = Object.values(ranking);
  const rankingComplete =
    groupOrder.every((group) => ranking[group]) &&
    new Set(usedRanks).size === groupOrder.length;
  const [wantsInterview, setWantsInterview] = useState(false);
  const [contact, setContact] = useState("");

  const submit = () => {
    if (wantsInterview && contact.trim()) {
      const existing = readJson<Array<{ participant_id: string; contact: string }>>(
        storageKeys.interviewContacts,
        [],
      );
      writeJson(storageKeys.interviewContacts, [
        ...existing,
        { participant_id: participantId, contact: contact.trim() },
      ]);
    }
    onSubmit();
  };

  return (
    <Panel eyebrow="Xếp hạng và phỏng vấn" icon={ClipboardCheck} title="So sánh trung lập">
      <div className="grid gap-3 lg:grid-cols-2">
        {groupOrder.map((group) => {
          const copy = groupCopy[group];
          const Icon = copy.icon;
          return (
            <article className="rounded-lg border border-slate-200 bg-white p-4" key={group}>
              <div className="mb-3 flex items-start gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", copy.color)}>
                  <Icon size={18} aria-hidden />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{copy.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {copy.neutralDescription}
                  </p>
                </div>
              </div>
              <label className="relative block">
                <select
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pr-9 text-sm outline-none focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                  onChange={(event) => onRanking(group, Number(event.target.value))}
                  value={ranking[group] ?? ""}
                >
                  <option value="" disabled>
                    Xếp hạng
                  </option>
                  {[1, 2, 3, 4].map((rank) => (
                    <option
                      disabled={usedRanks.includes(rank) && ranking[group] !== rank}
                      key={rank}
                      value={rank}
                    >
                      Hạng {rank}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                  aria-hidden
                />
              </label>
            </article>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3">
        <TextArea
          label="Điểm bạn thích nhất"
          onChange={(value) => onFeedback("liked_most", value)}
          value={feedback.liked_most}
        />
        <TextArea
          label="Lo ngại lớn nhất"
          onChange={(value) => onFeedback("biggest_concern", value)}
          value={feedback.biggest_concern}
        />
        <TextArea
          label="Bối cảnh bạn sẵn sàng sử dụng"
          onChange={(value) => onFeedback("use_context", value)}
          value={feedback.use_context}
        />
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input
            checked={wantsInterview}
            className="mt-1 h-4 w-4"
            onChange={(event) => setWantsInterview(event.target.checked)}
            type="checkbox"
          />
          <span>Tôi đồng ý để nhóm nghiên cứu liên hệ phỏng vấn sau.</span>
        </label>
        {wantsInterview && (
          <input
            className="mt-3 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
            onChange={(event) => setContact(event.target.value)}
            placeholder="Email hoặc số điện thoại"
            value={contact}
          />
        )}
      </div>

      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-slate-300"
          disabled={!rankingComplete}
          onClick={submit}
          type="button"
        >
          Hoàn tất
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
  );
}

function DebriefScreen({
  onExport,
  onExportEvents,
  onNew,
  session,
}: {
  onExport: () => void;
  onExportEvents: () => void;
  onNew: () => void;
  session: ExperimentSession;
}) {
  return (
    <Panel eyebrow="Kết thúc phiên" icon={CheckCircle2} title="Giải thích cuối thí nghiệm">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
        <p>
          Phiên này so sánh trải nghiệm thanh toán tại điểm bán giữa QR + PIN,
          thẻ NFC, nhận diện khuôn mặt tại POS và PalmPay tĩnh mạch lòng bàn
          tay. Trọng tâm là cảm nhận về sự đơn giản, thuận tiện, hữu ích, bảo
          mật, quyền riêng tư, niềm tin và ý định sử dụng.
        </p>
        {(session.assigned_group === "FACE_POS" ||
          session.assigned_group === "PALM_VEIN") && (
          <p className="mt-3 font-medium text-[#7a4a2a]">
            Mẫu sinh trắc học của phiên đã được xóa lúc{" "}
            {session.template_deleted_at ?? "kết thúc phiên"}.
          </p>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={onExport}
          type="button"
        >
          <Download size={17} aria-hidden />
          CSV dạng rộng
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={onExportEvents}
          type="button"
        >
          <ReceiptText size={17} aria-hidden />
          CSV nhật ký
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f]"
          onClick={onNew}
          type="button"
        >
          <UserPlus size={17} aria-hidden />
          Phiên mới
        </button>
      </div>
    </Panel>
  );
}

function Panel({
  children,
  eyebrow,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  icon: typeof QrCode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#6f3f24] text-white">
          <Icon size={21} aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-[#7a4a2a]">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">{title}</h1>
        </div>
      </div>
      {children}
    </section>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
      {children}
    </div>
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
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={cn("text-right text-sm", strong ? "font-semibold text-slate-950" : "font-medium text-slate-700")}>
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
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
