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
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  TimerReset,
  UserPlus,
} from "lucide-react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import surveyConfig from "@/data/survey-questions.json";
import { catalog, catalogCategories, formatVnd, getProduct } from "@/lib/catalog";
import type { CartLine, Product, ProductCategory } from "@/lib/types";

type StudyGroup = "QR_PIN" | "NFC_CARD" | "FACE_POS" | "PALM_VEIN";
type Cart = Record<string, number>;
type StepKey =
  | "admin"
  | "consent"
  | "pre"
  | "product"
  | "checkout"
  | "payment"
  | "success"
  | "post"
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
  participant_name: string;
  protocol_version: string;
  assigned_group: StudyGroup | null;
  created_at: string;
  consent_at: string | null;
  pre_survey_completed_at: string | null;
  post_survey_completed_at: string | null;
  session_status: "created" | "active" | "completed" | "technical_failure";
  current_step: StepKey;
  face_descriptor?: number[] | null;
  face_account_name?: string;
  qr_account_name?: string;
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
  events: EventLog[];
};

type AssignmentHistoryItem = {
  participant_id: string;
  participant_name?: string;
  assigned_group: StudyGroup;
  assigned_at: string;
  override_reason?: string;
};

type ExperimentStateSnapshot = {
  assignmentHistory: AssignmentHistoryItem[];
  assignmentQueue: StudyGroup[];
  completedSessions: ExperimentSession[];
  currentSession: ExperimentSession | null;
  participantCounter: number;
};

type InitialEnrollment = {
  biometricConsentAt?: string | null;
  faceDescriptor?: number[] | null;
  qrPin?: string;
};

const protocolVersion = "PALMPAY-POS-2026.06";
const startingBalance = 100000;
const faceMatchThreshold = 0.55;

const storageKeys = {
  currentSession: "palmpay.pos.currentSession",
  completedSessions: "palmpay.pos.completedSessions",
  participantCounter: "palmpay.pos.participantCounter",
  assignmentQueue: "palmpay.pos.assignmentQueue",
  assignmentHistory: "palmpay.pos.assignmentHistory",
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
    color: "bg-[#ede8df] text-[#3f342c] border-[#beb09f]",
  },
  NFC_CARD: {
    label: "Thẻ không tiếp xúc NFC",
    shortLabel: "NFC card",
    device: "Thẻ NFC + đầu đọc",
    neutralDescription:
      "Người tham gia dùng thẻ NFC thử nghiệm để chạm vào đầu đọc tại điểm bán cho giao dịch giá trị nhỏ.",
    instruction:
      "Chạm thẻ NFC thử nghiệm vào đầu đọc khi POS yêu cầu. Giao dịch trong phiên không yêu cầu PIN.",
    icon: Nfc,
    color: "bg-[#eef2e7] text-[#405438] border-[#c6d1b7]",
  },
  FACE_POS: {
    label: "Face ID tại POS",
    shortLabel: "Face ID",
    device: "Camera POS",
    neutralDescription:
      "Người tham gia đăng ký tên và khuôn mặt trước phiên, sau đó xác nhận thanh toán trực tiếp bằng camera tại POS.",
    instruction:
      "Đăng ký tên Face ID và ghi mẫu khuôn mặt trên màn hình đầu, rồi xác nhận bằng camera POS ở bước thanh toán.",
    icon: ScanFace,
    color: "bg-[#f8e2d9] text-[#8a432f] border-[#dfa493]",
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
    color: "bg-[#fff3df] text-[#7a4a2a] border-[#dfbd7f]",
  },
};

const stepLabels: Record<StepKey, string> = {
  admin: "Quản trị",
  consent: "Đồng ý",
  pre: "Khảo sát trước",
  product: "Sản phẩm",
  checkout: "Xác nhận",
  payment: "Thanh toán",
  success: "Thành công",
  post: "Khảo sát sau",
  debrief: "Giải thích",
};

const flowSteps: StepKey[] = [
  "consent",
  "pre",
  "product",
  "checkout",
  "payment",
  "success",
  "post",
  "debrief",
];

const preQuestions = surveyConfig.pre as SurveyQuestion[];
const postQuestions = surveyConfig.post as SurveyQuestion[];

type FaceApi = typeof import("@vladmandic/face-api");

type PublicQrTransfer = {
  amount: number;
  authMethod: "pin" | "face";
  authorizationCode: string | null;
  createdAt: string;
  id: string;
  matchDistance: number | null;
  paidAt: string | null;
  productSummary: string;
  receiverName: string;
  senderName: string;
  status: "pending" | "paid";
  transactionId: string;
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

function storagePatch<T>(key: string, value: T) {
  switch (key) {
    case storageKeys.assignmentHistory:
      return { assignmentHistory: value };
    case storageKeys.assignmentQueue:
      return { assignmentQueue: value };
    case storageKeys.completedSessions:
      return { completedSessions: value };
    case storageKeys.currentSession:
      return { currentSession: value };
    case storageKeys.participantCounter:
      return { participantCounter: value };
    default:
      return null;
  }
}

function persistExperimentState(patch: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  void fetch("/api/experiment-state", {
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  }).catch(() => {
    // The local mirror still lets the active POS session continue offline.
  });
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
  const patch = storagePatch(key, value);
  if (patch) persistExperimentState(patch);
}

function removeJson(key: string) {
  window.localStorage.removeItem(key);
  if (key === storageKeys.currentSession) {
    persistExperimentState({ currentSession: null });
  }
}

function normalizeStateSnapshot(value: unknown): ExperimentStateSnapshot {
  const state =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<ExperimentStateSnapshot>)
      : {};

  return {
    assignmentHistory: Array.isArray(state.assignmentHistory)
      ? state.assignmentHistory
      : [],
    assignmentQueue: Array.isArray(state.assignmentQueue)
      ? state.assignmentQueue.filter((item): item is StudyGroup =>
          groupOrder.includes(item as StudyGroup),
        )
      : [],
    completedSessions: Array.isArray(state.completedSessions)
      ? state.completedSessions.reduce<ExperimentSession[]>((sessions, item) => {
          const normalized = normalizeSession(item as ExperimentSession | null);
          if (normalized) sessions.push(normalized);
          return sessions;
        }, [])
      : [],
    currentSession: normalizeSession(
      (state.currentSession as ExperimentSession | null | undefined) ?? null,
    ),
    participantCounter:
      typeof state.participantCounter === "number" &&
      Number.isFinite(state.participantCounter)
        ? state.participantCounter
        : 0,
  };
}

function writeLocalJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function applyStateSnapshot(state: ExperimentStateSnapshot) {
  writeLocalJson(storageKeys.assignmentHistory, state.assignmentHistory);
  writeLocalJson(storageKeys.assignmentQueue, state.assignmentQueue);
  writeLocalJson(storageKeys.completedSessions, state.completedSessions);
  writeLocalJson(storageKeys.participantCounter, state.participantCounter);
  if (state.currentSession) {
    writeLocalJson(storageKeys.currentSession, state.currentSession);
  } else {
    window.localStorage.removeItem(storageKeys.currentSession);
  }
}

async function loadExperimentState() {
  const response = await fetch("/api/experiment-state", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load experiment state");
  }
  const data = (await response.json()) as { state?: unknown };
  return normalizeStateSnapshot(data.state);
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

function getNextAssignment(participantId: string, participantName?: string) {
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
      participant_name: participantName,
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

function makeSession(
  participantName: string,
  selectedGroup: StudyGroup | null = null,
  enrollment: InitialEnrollment = {},
): ExperimentSession {
  const trimmedName = participantName.trim() || "Khách thử nghiệm";
  const createdAt = nowIso();

  return {
    participant_id: makeParticipantId(),
    participant_name: trimmedName,
    protocol_version: protocolVersion,
    assigned_group: selectedGroup,
    created_at: createdAt,
    consent_at: null,
    pre_survey_completed_at: null,
    post_survey_completed_at: null,
    session_status: "created",
    current_step: "consent",
    biometric_consent_at:
      selectedGroup === "FACE_POS" ? enrollment.biometricConsentAt ?? null : null,
    face_descriptor:
      selectedGroup === "FACE_POS" ? enrollment.faceDescriptor ?? null : null,
    face_account_name: trimmedName,
    qr_account_name: trimmedName,
    qr_pin: selectedGroup === "QR_PIN" ? enrollment.qrPin ?? "" : "",
    template_ref:
      selectedGroup === "FACE_POS" || selectedGroup === "PALM_VEIN"
        ? `tpl_${crypto.randomUUID().slice(0, 8)}`
        : null,
    template_deleted_at: null,
    setup_started_at: createdAt,
    setup_completed_at: createdAt,
    checkout_started_at: null,
    checkout_completed_at: null,
    cart: {},
    transaction: null,
    pre_answers: {},
    post_answers: {},
    events: [],
  };
}

function normalizeSession(session: ExperimentSession | null) {
  if (!session) return null;
  const participantName =
    session.participant_name?.trim() || `Khách ${session.participant_id}`;
  const rawStep = session.current_step as string;
  if ((session.current_step as string) === "ranking") {
    return {
      ...session,
      face_descriptor: session.face_descriptor ?? null,
      face_account_name: session.face_account_name || participantName,
      participant_name: participantName,
      qr_account_name: session.qr_account_name || participantName,
      current_step: "debrief" as StepKey,
    };
  }
  return {
    ...session,
    current_step:
      rawStep === "assignment" || rawStep === "setup"
        ? "product"
        : session.current_step,
    face_descriptor: session.face_descriptor ?? null,
    face_account_name: session.face_account_name || participantName,
    participant_name: participantName,
    qr_account_name: session.qr_account_name || participantName,
    setup_started_at: session.setup_started_at ?? session.created_at,
    setup_completed_at: session.setup_completed_at ?? session.created_at,
  };
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

function normalizeSurveyAnswer(question: SurveyQuestion, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (question.type === "select") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    const index = (question.options ?? []).findIndex((option) => option === value);
    return index >= 0 ? index + 1 : "";
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : "";
}

function selectAnswerValue(question: SurveyQuestion, value: unknown) {
  const normalized = normalizeSurveyAnswer(question, value);
  return typeof normalized === "number" ? String(normalized) : "";
}

function methodCode(group?: StudyGroup | null) {
  if (!group) return "";
  const index = groupOrder.indexOf(group);
  return index >= 0 ? index + 1 : "";
}

function paymentStatusCode(status?: TransactionRecord["payment_status"] | null) {
  if (!status) return "";
  return status === "paid" ? 1 : 2;
}

type ExportColumn = {
  key: string;
  label: string;
};

const methodWorkbookColumns: ExportColumn[] = [
  { key: "timestamp", label: "Dấu thời gian" },
  { key: "participant_id", label: "Mã người tham gia" },
  { key: "participant_name", label: "Tên người tham gia" },
  { key: "qr_account_name", label: "Tên tài khoản QR" },
  { key: "face_account_name", label: "Tên đăng ký Face ID" },
  { key: "method_code", label: "Mã phương thức" },
  { key: "method", label: "Phương thức" },
  { key: "method_label", label: "Tên phương thức" },
  { key: "protocol_version", label: "Phiên bản protocol" },
  { key: "created_at", label: "Thời điểm tạo phiên" },
  { key: "consent_at", label: "Thời điểm đồng ý" },
  { key: "setup_completed_at", label: "Thời điểm hoàn tất đăng ký" },
  { key: "checkout_completed_at", label: "Thời điểm hoàn tất thanh toán" },
  { key: "session_status", label: "Trạng thái phiên" },
  { key: "payment_status_code", label: "Mã trạng thái thanh toán" },
  { key: "payment_status", label: "Trạng thái thanh toán" },
  { key: "transaction_id", label: "Mã giao dịch" },
  { key: "product_summary", label: "Sản phẩm đã chọn" },
  { key: "cart_total", label: "Tổng tiền" },
  { key: "cart_items", label: "Chi tiết giỏ hàng" },
  { key: "setup_duration", label: "Thời lượng đăng ký (giây)" },
  { key: "checkout_duration", label: "Thời lượng thanh toán (giây)" },
  { key: "number_of_retries", label: "Số lần thử lại" },
  { key: "number_of_errors", label: "Số lỗi" },
  { key: "assistance_required", label: "Cần hỗ trợ" },
  { key: "template_deleted_at", label: "Thời điểm xóa mẫu sinh trắc" },
  ...preQuestions.map((question) => ({
    key: `pre_${question.item_id}`,
    label: `PRE ${question.item_id}: ${question.text}`,
  })),
  ...postQuestions.map((question) => ({
    key: `post_${question.item_id}`,
    label: `POST ${question.item_id}: ${question.text}`,
  })),
];

function buildMethodWorkbookRow(session: ExperimentSession) {
  const group = session.assigned_group;
  const row: Record<string, unknown> = {
    timestamp:
      session.post_survey_completed_at ??
      session.checkout_completed_at ??
      session.created_at,
    participant_id: session.participant_id,
    participant_name: session.participant_name,
    qr_account_name: session.qr_account_name ?? "",
    face_account_name: session.face_account_name ?? "",
    method_code: methodCode(group),
    method: group ?? "",
    method_label: group ? groupCopy[group].label : "",
    protocol_version: session.protocol_version,
    created_at: session.created_at,
    consent_at: session.consent_at ?? "",
    setup_completed_at: session.setup_completed_at ?? "",
    checkout_completed_at: session.checkout_completed_at ?? "",
    session_status: session.session_status,
    payment_status_code: paymentStatusCode(session.transaction?.payment_status),
    payment_status: session.transaction?.payment_status ?? "",
    transaction_id: session.transaction?.transaction_id ?? "",
    product_summary: session.transaction?.product ?? "",
    cart_total: session.transaction?.amount ?? "",
    cart_items: session.transaction?.items
      ? JSON.stringify(session.transaction.items)
      : "",
    setup_duration: session.transaction?.setup_duration ?? "",
    checkout_duration: session.transaction?.checkout_duration ?? "",
    number_of_retries: session.transaction?.number_of_retries ?? 0,
    number_of_errors: session.transaction?.number_of_errors ?? 0,
    assistance_required: session.transaction?.assistance_required ? 1 : 0,
    template_deleted_at: session.template_deleted_at ?? "",
  };

  preQuestions.forEach((question) => {
    row[`pre_${question.item_id}`] = normalizeSurveyAnswer(
      question,
      session.pre_answers[question.item_id],
    );
  });
  postQuestions.forEach((question) => {
    row[`post_${question.item_id}`] = normalizeSurveyAnswer(
      question,
      session.post_answers[question.item_id],
    );
  });

  return row;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function xmlCell(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "<Cell><Data ss:Type=\"String\"></Data></Cell>";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function xmlRow(values: unknown[]) {
  return `<Row>${values.map(xmlCell).join("")}</Row>`;
}

function downloadMethodWorkbook(
  filename: string,
  sessions: ExperimentSession[],
) {
  const headerValues = methodWorkbookColumns.map((column) => column.label);
  const sheets = groupOrder
    .map((group) => {
      const rows = sessions
        .filter((session) => session.assigned_group === group)
        .map(buildMethodWorkbookRow);
      const tableRows = [
        xmlRow(headerValues),
        ...rows.map((row) =>
          xmlRow(methodWorkbookColumns.map((column) => row[column.key])),
        ),
      ].join("");

      return [
        `<Worksheet ss:Name="${escapeXml(group)}">`,
        "<Table>",
        tableRows,
        "</Table>",
        "</Worksheet>",
      ].join("");
    })
    .join("");

  const workbook = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:html="http://www.w3.org/TR/REC-html40">',
    sheets,
    "</Workbook>",
  ].join("");

  downloadBlob(
    filename,
    new Blob([workbook], {
      type: "application/vnd.ms-excel;charset=utf-8",
    }),
  );
}

function allStoredSessions(current?: ExperimentSession | null) {
  const completed = readJson<ExperimentSession[]>(
    storageKeys.completedSessions,
    [],
  );
  if (!current) return completed;
  const currentIndex = completed.findIndex(
    (item) => item.participant_id === current.participant_id,
  );
  if (currentIndex === -1) return [...completed, current];
  return completed.map((item, index) =>
    index === currentIndex ? current : item,
  );
}

export function DemoApp() {
  const [hydrated, setHydrated] = useState(false);
  const [qrPaymentId, setQrPaymentId] = useState<string | null>(null);
  const [session, setSession] = useState<ExperimentSession | null>(null);
  const cartLines = useMemo(() => cartToLines(session?.cart), [session?.cart]);
  const totalCents = useMemo(() => cartTotal(cartLines), [cartLines]);

  useEffect(() => {
    window.queueMicrotask(async () => {
      const paymentId = new URLSearchParams(window.location.search).get("qrPay");
      if (paymentId) {
        setQrPaymentId(paymentId);
        setHydrated(true);
        return;
      }
      try {
        const state = await loadExperimentState();
        applyStateSnapshot(state);
        setSession(state.currentSession);
      } catch {
        setSession(
          normalizeSession(
            readJson<ExperimentSession | null>(storageKeys.currentSession, null),
          ),
        );
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (session) {
      writeJson(storageKeys.currentSession, session);
    } else {
      removeJson(storageKeys.currentSession);
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

  const startNewSession = (
    participantName: string,
    selectedGroup: StudyGroup,
    enrollment: InitialEnrollment = {},
  ) => {
    const next = makeSession(participantName, selectedGroup, enrollment);
    const history = readJson<AssignmentHistoryItem[]>(
      storageKeys.assignmentHistory,
      [],
    );
    writeJson(storageKeys.assignmentHistory, [
      ...history,
      {
        participant_id: next.participant_id,
        participant_name: next.participant_name,
        assigned_group: selectedGroup,
        assigned_at: next.created_at,
        override_reason: "selected_on_start_screen",
      },
    ]);
    setSession({
      ...next,
      events: [
        {
          event_name: "session_created",
          timestamp: next.created_at,
          participant_id: next.participant_id,
          screen_name: "admin",
          metadata: {
            assigned_group: selectedGroup,
            face_registered: selectedGroup === "FACE_POS" && Boolean(enrollment.faceDescriptor),
            participant_name: next.participant_name,
            protocol_version: next.protocol_version,
            qr_pin_registered: selectedGroup === "QR_PIN" && /^\d{4}$/.test(enrollment.qrPin ?? ""),
            registration_location: "start_screen",
          },
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
      const hasSelectedGroup = Boolean(current.assigned_group);
      const assignedGroup =
        current.assigned_group ??
        getNextAssignment(current.participant_id, current.participant_name);
      const timestamp = nowIso();
      const setupTimestamp =
        current.setup_completed_at ?? current.setup_started_at ?? current.created_at ?? timestamp;
      return {
        ...current,
        assigned_group: assignedGroup,
        pre_survey_completed_at: timestamp,
        current_step: "product",
        setup_started_at: current.setup_started_at ?? setupTimestamp,
        setup_completed_at: current.setup_completed_at ?? setupTimestamp,
        template_ref:
          current.template_ref ??
          (assignedGroup === "FACE_POS" || assignedGroup === "PALM_VEIN"
            ? `tpl_${crypto.randomUUID().slice(0, 8)}`
            : null),
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
            event_name: hasSelectedGroup
              ? "selected_group_confirmed"
              : "random_group_assigned",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "pre",
            metadata: {
              assigned_group: assignedGroup,
              block_randomized: !hasSelectedGroup,
            },
          },
          {
            event_name: "product_started",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "product",
            metadata: { assigned_group: assignedGroup },
          },
        ],
      };
    });
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
    updateSession((current) => {
      const timestamp = nowIso();
      const biometric =
        current.assigned_group === "FACE_POS" || current.assigned_group === "PALM_VEIN";
      const completedSession: ExperimentSession = {
        ...current,
        current_step: "debrief",
        post_survey_completed_at: timestamp,
        session_status:
          current.session_status === "technical_failure" ? "technical_failure" : "completed",
        template_ref: biometric ? null : current.template_ref,
        template_deleted_at: biometric ? timestamp : current.template_deleted_at,
        face_descriptor: biometric ? null : current.face_descriptor,
        events: [
          ...current.events,
          {
            event_name: "post_survey_completed",
            timestamp,
            participant_id: current.participant_id,
            transaction_id: current.transaction?.transaction_id,
            screen_name: "post",
            metadata: { items: Object.keys(current.post_answers).length },
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

  if (qrPaymentId) {
    return <QrMobilePayment transferId={qrPaymentId} />;
  }

  if (!session) {
    return <AdminHome onCreate={startNewSession} />;
  }

  const payableAmount = session.transaction?.amount ?? totalCents;

  return (
    <main className="min-h-screen bg-[#f6efe5] text-stone-950">
      <ExperimentHeader session={session} onReset={resetCurrentSession} />
      <div className="mx-auto grid max-w-[1680px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
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
              accountName={session.qr_account_name ?? session.participant_name}
              faceAccountName={session.face_account_name ?? session.participant_name}
              faceDescriptor={session.face_descriptor}
              group={session.assigned_group}
              items={session.transaction?.items ?? cartLines}
              pin={session.qr_pin ?? ""}
              productSummary={session.transaction?.product ?? summarizeCart(cartLines)}
              retries={session.transaction?.number_of_retries ?? 0}
              senderName={
                session.assigned_group === "FACE_POS"
                  ? session.face_account_name ?? session.participant_name
                  : session.qr_account_name ?? session.participant_name
              }
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
          {session.current_step === "debrief" && (
            <DebriefScreen
              session={session}
              onExport={() =>
                downloadMethodWorkbook(
                  "palmpay-method-sheets.xls",
                  allStoredSessions(session),
                )
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
      <div className="inline-flex items-center gap-3 rounded-lg border border-[#ead8bf] bg-white px-4 py-3 text-sm text-stone-600 shadow-sm">
        <Loader2 className="animate-spin" size={18} aria-hidden />
        Loading
      </div>
    </div>
  );
}

function QrMobilePayment({ transferId }: { transferId: string }) {
  const [transfer, setTransfer] = useState<PublicQrTransfer | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/qr-transfers/${transferId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { transfer: PublicQrTransfer }) => {
        if (active) setTransfer(data.transfer);
      })
      .catch(() => {
        if (active) setError("Không tìm thấy giao dịch QR.");
      });

    return () => {
      active = false;
    };
  }, [transferId]);

  const confirmPin = async () => {
    if (!/^\d{4}$/.test(pin)) return;
    setBusy(true);
    setError("");
    window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/qr-transfers/${transferId}`, {
          body: JSON.stringify({ pin }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data = (await response.json().catch(() => null)) as
          | { error?: string; transfer?: PublicQrTransfer }
          | null;
        if (!response.ok || !data?.transfer) {
          setError(data?.error ?? "Không xác nhận được giao dịch.");
          return;
        }
        setTransfer(data.transfer);
      } catch {
        setError("Không kết nối được máy chủ thanh toán.");
      } finally {
        setBusy(false);
      }
    }, 900);
  };

  if (!transfer && !error) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-screen bg-[#f6efe5] px-4 py-6 text-stone-950">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-sm flex-col rounded-[28px] border-4 border-stone-900 bg-stone-950 p-3 shadow-xl">
        <div className="flex flex-1 flex-col rounded-[22px] bg-[#fffaf3] p-5">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#7a4a2a]">DemoBank</p>
              <h1 className="mt-1 text-2xl font-semibold">Chuyển khoản</h1>
            </div>
            <Smartphone size={22} aria-hidden />
          </div>

          {transfer ? (
            <>
              <div className="space-y-3 rounded-lg border border-[#ead8bf] bg-white p-4">
                <Row label="Người gửi" value={transfer.senderName} />
                <Row label="Người nhận" value={transfer.receiverName} />
                <Row label="Sản phẩm" value={transfer.productSummary} />
                <Row label="Số tiền" value={formatVnd(transfer.amount)} strong />
              </div>

              {transfer.status === "paid" ? (
                <div className="mt-5 rounded-lg border border-[#d8b88b] bg-[#fff3df] p-5 text-center text-[#4f2f1c]">
                  <CheckCircle2 className="mx-auto mb-3" size={36} aria-hidden />
                  <h2 className="text-xl font-semibold">Thanh toán hoàn tất</h2>
                  <p className="mt-2 text-sm">
                    Mã xác nhận: {transfer.authorizationCode ?? "QR-PAID"}
                  </p>
                </div>
              ) : (
                transfer.authMethod === "face" ? (
                  <FaceMobileConfirmation
                    onError={setError}
                    onPaid={setTransfer}
                    transferId={transferId}
                  />
                ) : (
                  <div className="mt-5">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-stone-700">
                        Nhập PIN DemoBank
                      </span>
                      <input
                        className="h-12 w-full rounded-lg border border-[#ead8bf] bg-white px-3 text-center text-lg font-semibold tracking-[0.3em] outline-none focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(event) =>
                          setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                        }
                        placeholder="0000"
                        type="password"
                        value={pin}
                      />
                    </label>
                    <button
                      className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
                      disabled={busy || !/^\d{4}$/.test(pin)}
                      onClick={confirmPin}
                      type="button"
                    >
                      {busy ? <Loader2 className="animate-spin" size={17} /> : <BadgeCheck size={17} />}
                      {busy ? "Đang xác minh..." : "Xác nhận thanh toán"}
                    </button>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {error && transfer?.status !== "paid" && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function FaceMobileConfirmation({
  onError,
  onPaid,
  transferId,
}: {
  onError: (message: string) => void;
  onPaid: (transfer: PublicQrTransfer) => void;
  transferId: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [api, setApi] = useState<FaceApi | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [message, setMessage] = useState("Mở camera để xác nhận Face ID");

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startCamera = async () => {
    setBusy(true);
    onError("");
    try {
      const loadedApi = api ?? (await loadFaceApiModels());
      setApi(loadedApi);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setMessage("Camera đã sẵn sàng");
    } catch {
      setMessage("Không mở được camera");
      onError("Không mở được camera trên điện thoại.");
    } finally {
      setBusy(false);
    }
  };

  const confirmFace = async () => {
    if (!api || !videoRef.current) {
      await startCamera();
      return;
    }

    setBusy(true);
    onError("");
    setMessage("Đang quét khuôn mặt...");
    try {
      const detection = await api
        .detectSingleFace(
          videoRef.current,
          new api.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.5,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setMessage("Không phát hiện khuôn mặt rõ");
        onError("Không phát hiện khuôn mặt rõ. Thử nhìn thẳng vào camera.");
        setBusy(false);
        return;
      }

      setMessage("Đang xác minh giao dịch...");
      window.setTimeout(async () => {
        try {
          const response = await fetch(`/api/qr-transfers/${transferId}`, {
            body: JSON.stringify({
              faceDescriptor: Array.from(detection.descriptor),
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          const data = (await response.json().catch(() => null)) as
            | {
                error?: string;
                matchDistance?: number;
                threshold?: number;
                transfer?: PublicQrTransfer;
              }
            | null;
          if (!response.ok || !data?.transfer) {
            const detail =
              typeof data?.matchDistance === "number" &&
              typeof data?.threshold === "number"
                ? ` (${data.matchDistance.toFixed(2)} > ${data.threshold})`
                : "";
            setMessage("Face ID không khớp");
            onError(`${data?.error ?? "Không xác nhận được Face ID."}${detail}`);
            return;
          }
          setMessage("Face ID đã xác nhận");
          onPaid(data.transfer);
        } catch {
          setMessage("Không kết nối được máy chủ thanh toán");
          onError("Không kết nối được máy chủ thanh toán.");
        } finally {
          setBusy(false);
        }
      }, 900);
    } catch {
      setMessage("Không thể xác minh khuôn mặt");
      onError("Không thể xác minh khuôn mặt.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-[#ead8bf] bg-stone-900">
        <video className="h-full w-full object-cover" muted playsInline ref={videoRef} />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/80">
            Face ID camera
          </div>
        )}
      </div>
      <p className="rounded-lg border border-[#ead8bf] bg-white px-3 py-2 text-sm font-medium text-[#6f3f24]">
        {message}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3] disabled:text-[#b8a491]"
          disabled={busy}
          onClick={startCamera}
          type="button"
        >
          <Camera size={17} aria-hidden />
          Mở camera
        </button>
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
          disabled={busy}
          onClick={confirmFace}
          type="button"
        >
          {busy ? <Loader2 className="animate-spin" size={17} /> : <ScanFace size={17} />}
          Xác nhận Face ID
        </button>
      </div>
    </div>
  );
}

function AdminHome({
  onCreate,
}: {
  onCreate: (
    participantName: string,
    selectedGroup: StudyGroup,
    enrollment?: InitialEnrollment,
  ) => void;
}) {
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([]);
  const [completed, setCompleted] = useState<ExperimentSession[]>([]);
  const [participantName, setParticipantName] = useState("");
  const [qrPin, setQrPin] = useState("");
  const [faceConsentAt, setFaceConsentAt] = useState<string | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<StudyGroup | null>(null);

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
  const trimmedName = participantName.trim();
  const chooseGroup = (group: StudyGroup) => {
    if (group !== selectedGroup) {
      setQrPin("");
      setFaceConsentAt(null);
      setFaceDescriptor(null);
    }
    setSelectedGroup(group);
  };
  const credentialReady =
    selectedGroup === "QR_PIN"
      ? /^\d{4}$/.test(qrPin)
      : selectedGroup === "FACE_POS"
        ? Boolean(faceDescriptor)
        : Boolean(selectedGroup);

  return (
    <main className="min-h-screen bg-[#f6efe5] px-4 py-5 text-stone-950 sm:px-6">
      <div className="mx-auto grid max-w-[1680px] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-[#ead8bf] bg-white p-5 shadow-sm">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <Image
                alt="PalmPay"
                className="mb-3 h-auto w-40"
                height={64}
                priority
                src="/brand/palmpay-logo.svg"
                width={264}
              />
              <p className="text-sm font-medium text-[#7a4a2a]">{protocolVersion}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">
                PalmPay Coffee Experiment
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                Nền tảng mô phỏng thí nghiệm tại quầy cafe: người tham gia
                đi theo luồng nghiên cứu đầy đủ, chọn món từ catalog, rồi
                thanh toán bằng phương thức được chọn cho phiên thử nghiệm.
              </p>
            </div>
            <form
              className="grid w-full max-w-sm gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!trimmedName || !selectedGroup || !credentialReady) return;
                onCreate(trimmedName, selectedGroup, {
                  biometricConsentAt: faceConsentAt,
                  faceDescriptor,
                  qrPin,
                });
              }}
            >
              <label className="text-sm font-medium text-stone-700" htmlFor="participant-name">
                Tên người tham gia
              </label>
              <input
                className="h-11 rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-3 text-sm outline-none transition focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                id="participant-name"
                onChange={(event) => setParticipantName(event.target.value)}
                placeholder="Ví dụ: Minh Anh"
                value={participantName}
              />
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
                disabled={!trimmedName || !selectedGroup || !credentialReady}
                type="submit"
              >
                <UserPlus size={17} aria-hidden />
                Tạo phiên mới
              </button>
            </form>
          </div>

          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-stone-950">
                Chọn phương thức cho phiên
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                Mỗi phương thức sẽ mở đúng luồng đăng ký và thanh toán tương ứng.
              </p>
            </div>
            {selectedGroup && (
              <span className="rounded-full border border-[#ead8bf] bg-[#fffaf3] px-3 py-1 text-xs font-semibold text-[#6f3f24]">
                Đã chọn {groupCopy[selectedGroup].shortLabel}
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {counts.map(({ group, count }) => {
              const copy = groupCopy[group];
              const Icon = copy.icon;
              const selected = selectedGroup === group;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#b78352]",
                    copy.color,
                    selected && "border-[#6f3f24] ring-2 ring-[#6f3f24]/25",
                  )}
                  key={group}
                  onClick={() => chooseGroup(group)}
                  type="button"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Icon size={20} aria-hidden />
                    <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold">
                      {count} người
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold">{copy.shortLabel}</h2>
                  <p className="mt-1 text-xs leading-5 opacity-80">{copy.device}</p>
                </button>
              );
            })}
          </div>

          {selectedGroup === "QR_PIN" && (
            <div className="mt-4 rounded-lg border border-[#ead8bf] bg-[#fffaf3] p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                <div>
                  <h2 className="text-sm font-semibold text-stone-950">
                    Đăng ký DemoBank QR
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    Tên người gửi sẽ dùng chính tên người tham gia đã nhập ở trên.
                    PIN này dùng để xác nhận màn hình chuyển khoản sau khi quét QR.
                  </p>
                  <p className="mt-3 rounded-lg border border-[#ead8bf] bg-white px-3 py-2 text-sm font-medium text-[#6f3f24]">
                    Người gửi: {trimmedName || "Nhập tên người tham gia"}
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-stone-700">
                    Mã PIN 4 số
                  </span>
                  <input
                    className="h-11 w-full rounded-lg border border-[#ead8bf] bg-white px-3 text-center text-lg font-semibold tracking-[0.25em] outline-none transition focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(event) =>
                      setQrPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="0000"
                    type="password"
                    value={qrPin}
                  />
                </label>
              </div>
            </div>
          )}

          {selectedGroup === "FACE_POS" && (
            <div className="mt-4 rounded-lg border border-[#ead8bf] bg-[#fffaf3] p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-stone-950">
                  Đăng ký Face ID
                </h2>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  Nhập tên người tham gia trước, sau đó mở camera để ghi mẫu khuôn
                  mặt. Face ID sẽ xác nhận thanh toán trực tiếp trên POS.
                </p>
              </div>
              <label className="mb-4 flex items-start gap-3 rounded-lg border border-[#ead8bf] bg-white p-3 text-sm text-stone-700">
                <input
                  checked={Boolean(faceConsentAt)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#6f3f24]"
                  disabled={!trimmedName || Boolean(faceConsentAt)}
                  onChange={(event) => {
                    if (event.target.checked) setFaceConsentAt(nowIso());
                  }}
                  type="checkbox"
                />
                <span>
                  Tôi đồng ý tạo mẫu đặc trưng khuôn mặt mã hóa cho phiên thử nghiệm này.
                </span>
              </label>
              <FaceEnrollment
                consentReady={Boolean(trimmedName && faceConsentAt)}
                enrolled={Boolean(faceDescriptor)}
                onEnroll={(descriptor) => setFaceDescriptor(descriptor)}
              />
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-[#ead8bf] bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Thiết bị</h2>
            <div className="mt-3 space-y-2 text-sm">
              {[
                "Điện thoại DemoBank",
                "Đầu đọc thẻ NFC",
                "Camera POS Face ID",
                "Máy quét PalmPay",
              ].map((item) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-[#ead8bf] px-3 py-2"
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

          <section className="rounded-lg border border-[#ead8bf] bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Xuất dữ liệu</h2>
            <div className="mt-3 grid gap-2">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
                disabled={completed.length === 0}
                onClick={() =>
                  downloadMethodWorkbook("palmpay-method-sheets.xls", completed)
                }
                type="button"
              >
                <Download size={16} aria-hidden />
                Bảng 4 sheet
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
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
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center">
            <Image
              alt=""
              aria-hidden
              height={40}
              priority
              src="/brand/palmpay-mark.svg"
              width={40}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              PalmPay Coffee Study
            </p>
            <p className="truncate text-xs text-stone-500">
              {session.participant_id} · {session.participant_name || "Người tham gia"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-3 py-2 text-sm font-medium text-stone-700">
            Số dư: {formatVnd(startingBalance)}
          </span>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
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
    <aside className="self-start rounded-lg border border-[#ead8bf] bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:-mt-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
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
                    ? "border-[#ead8bf] bg-[#fffaf3] text-stone-500"
                    : "border-transparent text-stone-400",
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
      <div className="grid gap-3 text-sm leading-6 text-stone-600 sm:grid-cols-2">
        {[
          "Đây là nghiên cứu học thuật.",
          "Không sử dụng tiền thật hoặc tài khoản thật.",
          "Bạn có thể dừng tham gia bất kỳ lúc nào.",
          "Dữ liệu chỉ được sử dụng cho mục đích nghiên cứu.",
        ].map((item) => (
          <div
            className="rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-3 py-3"
            key={item}
          >
            {item}
          </div>
        ))}
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-lg border border-[#ead8bf] bg-white p-3 text-sm text-stone-700">
        <input
          checked={checked}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#6f3f24]"
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
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
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
    (question) =>
      !question.required ||
      (answers[question.item_id] !== undefined && answers[question.item_id] !== ""),
  );
  return (
    <Panel eyebrow={eyebrow} icon={ClipboardCheck} title={title}>
      <div className="space-y-4">
        {questions.map((question) => {
          const answerValue = answers[question.item_id];
          const normalizedValue = normalizeSurveyAnswer(question, answerValue);
          return (
            <div
              className="rounded-lg border border-[#ead8bf] bg-white p-4"
              key={question.item_id}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-950">
                    {question.text}
                  </p>
                </div>
              </div>
              {question.type === "select" ? (
                <div className="max-w-sm">
                  <CustomSelect
                    onChange={(value) => onAnswer(question.item_id, Number(value))}
                    options={(question.options ?? []).map((option, index) => ({
                      label: option,
                      value: String(index + 1),
                    }))}
                    placeholder="Chọn câu trả lời"
                    value={selectAnswerValue(question, answerValue)}
                  />
                </div>
              ) : (
                <Likert
                  max={question.scale_max ?? 7}
                  min={question.scale_min ?? 1}
                  onChange={(value) => onAnswer(question.item_id, value)}
                  value={typeof normalizedValue === "number" ? normalizedValue : null}
                />
              )}
            </div>
          );
        })}
      </div>
      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
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
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}
      >
        {values.map((item) => (
          <button
            className={cn(
              "h-11 rounded-lg border text-sm font-semibold transition",
              value === item
                ? "border-[#6f3f24] bg-[#6f3f24] text-white"
                : "border-[#ead8bf] bg-[#fffaf3] text-stone-700 hover:border-[#c9955d]",
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
        <span>Hoàn toàn không đồng ý</span>
        <span>Hoàn toàn đồng ý</span>
      </div>
    </div>
  );
}

function averageDescriptors(descriptors: Float32Array[]) {
  if (!descriptors.length) return [];
  const length = descriptors[0].length;
  return Array.from({ length }, (_, index) => {
    const sum = descriptors.reduce((total, descriptor) => total + descriptor[index], 0);
    return Number((sum / descriptors.length).toFixed(6));
  });
}

async function loadFaceApiModels() {
  const faceapi = await import("@vladmandic/face-api");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("/models/face-api"),
    faceapi.nets.faceLandmark68Net.loadFromUri("/models/face-api"),
    faceapi.nets.faceRecognitionNet.loadFromUri("/models/face-api"),
  ]);
  return faceapi;
}

function FaceEnrollment({
  consentReady,
  enrolled,
  onEnroll,
}: {
  consentReady: boolean;
  enrolled: boolean;
  onEnroll: (descriptor: number[], metadata: Record<string, unknown>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [api, setApi] = useState<FaceApi | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState("");
  const [sampleCount, setSampleCount] = useState(enrolled ? 3 : 0);
  const descriptorsRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startCamera = async () => {
    setBusy(true);
    setError("");
    try {
      const loadedApi = api ?? (await loadFaceApiModels());
      setApi(loadedApi);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (cameraError) {
      setError(
        cameraError instanceof Error
          ? cameraError.message
          : "Không mở được camera.",
      );
    } finally {
      setBusy(false);
    }
  };

  const captureFace = async () => {
    if (!api || !videoRef.current) {
      await startCamera();
      return;
    }

    setBusy(true);
    setError("");
    try {
      const detection = await api
        .detectSingleFace(
          videoRef.current,
          new api.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.5,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setError("Không phát hiện khuôn mặt rõ. Thử nhìn thẳng vào camera.");
        return;
      }

      descriptorsRef.current = [...descriptorsRef.current, detection.descriptor].slice(-3);
      const nextCount = descriptorsRef.current.length;
      setSampleCount(nextCount);

      if (nextCount >= 3) {
        onEnroll(averageDescriptors(descriptorsRef.current), {
          face_model: "tiny_face_detector+face_landmark_68+face_recognition",
          raw_image_stored: false,
          sample_count: nextCount,
        });
      }
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Không thể ghi mẫu khuôn mặt.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#ead8bf] bg-white p-4">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-[#ead8bf] bg-stone-900">
        <video
          className="h-full w-full object-cover"
          muted
          playsInline
          ref={videoRef}
        />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/80">
            Camera enrollment
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          Mẫu đã ghi: <span className="font-semibold">{sampleCount}/3</span>
        </p>
        <div className="flex gap-2">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3] disabled:text-[#b8a491]"
            disabled={!consentReady || busy}
            onClick={startCamera}
            type="button"
          >
            <Camera size={16} aria-hidden />
            Mở camera
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-3 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
            disabled={!consentReady || busy || enrolled}
            onClick={captureFace}
            type="button"
          >
            {busy ? <Loader2 className="animate-spin" size={16} /> : <ScanFace size={16} />}
            Ghi mẫu
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
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
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
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

          <div className="grid items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-3">
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
          <div className="mt-4 border-t border-[#ead8bf] pt-4">
            <button
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
              disabled={!canContinue}
              onClick={onContinue}
              type="button"
            >
              Xác nhận giỏ hàng
              <ArrowRight size={17} aria-hidden />
            </button>
          </div>
        </aside>
      </div>
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
  const selected = quantity > 0;
  const selectProduct = () => {
    if (!selected) onAdd();
  };

  return (
    <article
      aria-label={`${selected ? "Đã chọn" : "Chọn"} ${product.name}`}
      aria-pressed={selected}
      className={cn(
        "group flex h-full min-h-[460px] flex-col overflow-hidden rounded-lg border bg-white text-left shadow-sm outline-none transition focus:ring-2 focus:ring-[#9a6237]",
        selected
          ? "border-[#9a6237] bg-[#fffaf3] shadow-md ring-2 ring-[#c9955d]/25"
          : "cursor-pointer border-[#ead8bf] hover:border-[#c9955d] hover:shadow-md",
      )}
      onClick={selectProduct}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectProduct();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative aspect-[4/3] bg-[#efe1cf]">
        <Image
          alt={product.imageAlt}
          className={cn(
            "object-cover transition duration-300",
            selected ? "scale-[1.02]" : "group-hover:scale-[1.02]",
          )}
          fill
          sizes="(min-width: 1024px) 340px, (min-width: 768px) 45vw, 92vw"
          src={product.image}
        />
        {product.popular && (
          <span className="absolute left-3 top-3 rounded-lg bg-[#fffaf3]/95 px-2 py-1 text-xs font-semibold text-[#6f3f24] shadow-sm">
            Popular
          </span>
        )}
        {selected && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-[#6f3f24] px-2 py-1 text-xs font-semibold text-white shadow-sm">
            <CheckCircle2 size={14} aria-hidden />
            Đã chọn
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-1 items-start justify-between gap-3">
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
        <div
          className={cn(
            "mt-4 flex h-11 items-center justify-between rounded-lg border px-2 transition",
            selected
              ? "border-[#9a6237] bg-[#efe1cf]"
              : "border-[#dcc6aa] bg-[#fffaf3]",
          )}
        >
          <button
            aria-label={`Giảm ${product.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-700 transition hover:bg-white disabled:text-[#b8a491]"
            disabled={quantity === 0}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
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
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
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
            POS sẽ chuyển thẳng sang phương thức đã chọn cho phiên này.
          </p>
        </div>
      </div>
      <ActionRow>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
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
  accountName,
  faceAccountName,
  faceDescriptor,
  group,
  items,
  onComplete,
  onFailure,
  onLog,
  onRetry,
  pin,
  productSummary,
  retries,
  senderName,
  totalCents,
  transactionId,
}: {
  accountName: string;
  faceAccountName: string;
  faceDescriptor?: number[] | null;
  group: StudyGroup;
  items: CartLine[];
  onComplete: (metadata?: Record<string, unknown>) => void;
  onFailure: () => void;
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
  onRetry: (errorCode: string) => void;
  pin: string;
  productSummary: string;
  retries: number;
  senderName: string;
  totalCents: number;
  transactionId: string;
}) {
  const [busy, setBusy] = useState(false);

  const finish = useCallback((metadata: Record<string, unknown>) => {
    setBusy(true);
    window.setTimeout(() => onComplete(metadata), 600);
  }, [onComplete]);

  return (
    <Panel eyebrow="Thanh toán tại POS" icon={groupCopy[group].icon} title={groupCopy[group].label}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-[#ead8bf] bg-white p-4">
          {group === "QR_PIN" && (
            <QrPosPayment
              amount={totalCents}
              authMethod="pin"
              items={items}
              onLog={onLog}
              onPaid={(transfer) =>
                finish({
                  authorization_code: transfer.authorizationCode,
                  channel: "qr_pin",
                  transfer_id: transfer.id,
                })
              }
              pin={pin}
              productSummary={productSummary}
              senderName={senderName || accountName}
              transactionId={transactionId}
            />
          )}

          {group === "NFC_CARD" && (
            <NfcBridgePayment
              amount={totalCents}
              busy={busy}
              onComplete={(tap) => finish({ channel: "nfc_card", card_ref: tap.cardRef })}
              onLog={onLog}
              onRetry={onRetry}
              transactionId={transactionId}
            />
          )}

          {group === "FACE_POS" && (
            <FacePosPayment
              amount={totalCents}
              busy={busy}
              faceDescriptor={faceDescriptor}
              onComplete={(metadata) =>
                finish({
                  channel: "face_pos",
                  ...metadata,
                })
              }
              onLog={onLog}
              productSummary={productSummary}
              senderName={faceAccountName || accountName}
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
    </Panel>
  );
}

function descriptorDistance(left: number[], right: ArrayLike<number>) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  const squared = left.reduce((total, value, index) => {
    const delta = value - right[index];
    return total + delta * delta;
  }, 0);
  return Math.sqrt(squared);
}

function FacePosPayment({
  amount,
  busy,
  faceDescriptor,
  onComplete,
  onLog,
  productSummary,
  senderName,
}: {
  amount: number;
  busy: boolean;
  faceDescriptor?: number[] | null;
  onComplete: (metadata: Record<string, unknown>) => void;
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
  productSummary: string;
  senderName: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [api, setApi] = useState<FaceApi | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [message, setMessage] = useState("Mở camera POS để xác nhận Face ID");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startCamera = async () => {
    setLocalBusy(true);
    setError("");
    try {
      const loadedApi = api ?? (await loadFaceApiModels());
      setApi(loadedApi);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setMessage("Camera POS đã sẵn sàng");
      onLog("face_pos_camera_opened", "payment", {});
    } catch {
      setMessage("Không mở được camera POS");
      setError("Không mở được camera để xác nhận Face ID.");
    } finally {
      setLocalBusy(false);
    }
  };

  const confirmFace = async () => {
    if (!faceDescriptor?.length) {
      setError("Chưa có mẫu Face ID đã đăng ký.");
      return;
    }
    if (!api || !videoRef.current) {
      await startCamera();
      return;
    }

    setLocalBusy(true);
    setError("");
    setMessage("Đang quét khuôn mặt...");
    try {
      const detection = await api
        .detectSingleFace(
          videoRef.current,
          new api.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.5,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setMessage("Không phát hiện khuôn mặt rõ");
        setError("Không phát hiện khuôn mặt rõ. Thử nhìn thẳng vào camera.");
        onLog("face_pos_no_face", "payment", {});
        return;
      }

      const matchDistance = descriptorDistance(faceDescriptor, detection.descriptor);
      if (matchDistance > faceMatchThreshold) {
        setMessage("Face ID không khớp");
        setError(
          `Khuôn mặt không khớp (${matchDistance.toFixed(2)} > ${faceMatchThreshold}).`,
        );
        onLog("face_pos_match_failed", "payment", {
          match_distance: matchDistance,
          threshold: faceMatchThreshold,
        });
        return;
      }

      setMessage("Face ID đã xác nhận");
      onLog("face_pos_match_success", "payment", {
        match_distance: matchDistance,
        threshold: faceMatchThreshold,
      });
      onComplete({
        match_distance: matchDistance,
        threshold: faceMatchThreshold,
      });
    } catch {
      setMessage("Không thể xác minh khuôn mặt");
      setError("Không thể xác minh khuôn mặt.");
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-[#ead8bf] bg-stone-900">
        <video className="h-full w-full object-cover" muted playsInline ref={videoRef} />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/80">
            Camera POS Face ID
          </div>
        )}
      </div>
      <div className="rounded-lg border border-[#ead8bf] bg-white p-4 text-sm">
        <Row label="Người gửi" value={senderName} />
        <Row label="Người nhận" value="Palm Pay" />
        <Row label="Sản phẩm" value={productSummary} />
        <Row label="Số tiền" value={formatVnd(amount)} strong />
        <Row label="Xác thực" value="Face ID tại POS" />
      </div>
      <p className="rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-3 py-2 text-sm font-medium text-[#6f3f24]">
        {message}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3] disabled:text-[#b8a491]"
          disabled={busy || localBusy}
          onClick={startCamera}
          type="button"
        >
          <Camera size={17} aria-hidden />
          Mở camera POS
        </button>
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
          disabled={busy || localBusy || !faceDescriptor?.length}
          onClick={confirmFace}
          type="button"
        >
          {localBusy ? <Loader2 className="animate-spin" size={17} /> : <ScanFace size={17} />}
          Xác nhận Face ID
        </button>
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function QrPosPayment({
  amount,
  authMethod,
  faceDescriptor,
  items,
  onLog,
  onPaid,
  pin,
  productSummary,
  senderName,
  transactionId,
}: {
  amount: number;
  authMethod: "pin" | "face";
  faceDescriptor?: number[] | null;
  items: CartLine[];
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
  onPaid: (transfer: PublicQrTransfer) => void;
  pin: string;
  productSummary: string;
  senderName: string;
  transactionId: string;
}) {
  const [paymentUrl, setPaymentUrl] = useState("");
  const [transfer, setTransfer] = useState<PublicQrTransfer | null>(null);
  const [error, setError] = useState("");
  const paidHandledRef = useRef(false);
  const faceDescriptorKey = useMemo(
    () => JSON.stringify(faceDescriptor ?? []),
    [faceDescriptor],
  );
  const itemsKey = useMemo(() => JSON.stringify(items), [items]);

  useEffect(() => {
    let active = true;
    const credentialReady =
      authMethod === "pin" ? /^\d{4}$/.test(pin) : Boolean(faceDescriptor?.length);
    if (!transactionId || !credentialReady || transfer) return;

    fetch("/api/qr-transfers", {
      body: JSON.stringify({
        amount,
        authMethod,
        faceDescriptor: authMethod === "face" ? faceDescriptor : undefined,
        items,
        pin: authMethod === "pin" ? pin : undefined,
        productSummary,
        senderName,
        transactionId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { transfer: PublicQrTransfer }) => {
        if (!active) return;
        setTransfer(data.transfer);
        setPaymentUrl(`${window.location.origin}/?qrPay=${data.transfer.id}`);
        onLog(
          authMethod === "face" ? "face_qr_transfer_created" : "qr_transfer_created",
          "payment",
          {
            amount,
            auth_method: authMethod,
            transfer_id: data.transfer.id,
          },
        );
      })
      .catch(() => {
        if (active) setError("Không tạo được QR chuyển khoản.");
      });

    return () => {
      active = false;
    };
  }, [
    amount,
    authMethod,
    faceDescriptor,
    faceDescriptorKey,
    items,
    itemsKey,
    onLog,
    pin,
    productSummary,
    senderName,
    transactionId,
    transfer,
  ]);

  useEffect(() => {
    if (!transfer || transfer.status === "paid") return;
    const interval = window.setInterval(() => {
      fetch(`/api/qr-transfers/${transfer.id}`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data: { transfer: PublicQrTransfer }) => {
          setTransfer(data.transfer);
          if (data.transfer.status === "paid" && !paidHandledRef.current) {
            paidHandledRef.current = true;
            onLog(
              data.transfer.authMethod === "face"
                ? "face_qr_transfer_paid"
                : "qr_transfer_paid",
              "payment",
              {
                authorization_code: data.transfer.authorizationCode,
                auth_method: data.transfer.authMethod,
                match_distance: data.transfer.matchDistance,
                transfer_id: data.transfer.id,
              },
            );
            onPaid(data.transfer);
          }
        })
        .catch(() => setError("Mất kết nối trạng thái QR."));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [onLog, onPaid, transfer]);

  return (
    <div className="space-y-4">
      <div className="flex justify-center rounded-lg border border-[#ead8bf] bg-[#fffaf3] p-4">
        {paymentUrl ? (
          <QRCodeSVG level="M" size={230} value={paymentUrl} />
        ) : (
          <Loader2 className="animate-spin text-[#7a4a2a]" size={42} aria-hidden />
        )}
      </div>
      <div className="rounded-lg border border-[#ead8bf] bg-white p-4 text-sm">
        <Row label="Người gửi" value={senderName} />
        <Row label="Người nhận" value="Palm Pay" />
        <Row label="Sản phẩm" value={productSummary} />
        <Row label="Số tiền" value={formatVnd(amount)} strong />
        <Row
          label="Xác thực"
          value={authMethod === "face" ? "Face ID" : "PIN DemoBank"}
        />
      </div>
      <div className="rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-3 py-2 text-sm text-stone-600">
        Trạng thái:{" "}
        <span className="font-semibold text-[#6f3f24]">
          {transfer?.status === "paid"
            ? "Điện thoại đã xác nhận thanh toán"
            : authMethod === "face"
              ? "Đang chờ điện thoại quét QR và xác minh khuôn mặt"
              : "Đang chờ điện thoại quét QR"}
        </span>
      </div>
      {paymentUrl && (
        <a
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
          href={paymentUrl}
          rel="noreferrer"
          target="_blank"
        >
          Mở mock mobile trên máy này
          <ArrowRight size={16} aria-hidden />
        </a>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function NfcBridgePayment({
  amount,
  busy,
  onComplete,
  onLog,
  onRetry,
  transactionId,
}: {
  amount: number;
  busy: boolean;
  onComplete: (tap: { cardRef: string; transactionId: string }) => void;
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
  onRetry: (errorCode: string) => void;
  transactionId: string;
}) {
  const handledRef = useRef(false);
  const lastTapKeyRef = useRef("");
  const [status, setStatus] = useState("Đang đăng ký giao dịch với NFC reader bridge");

  useEffect(() => {
    if (!transactionId) return;
    let active = true;

    fetch("/api/nfc-session", {
      body: JSON.stringify({
        acceptedCardRef: "CARD-POS-042",
        amount,
        transactionId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        if (active) setStatus("Đang chờ tap từ NFC reader bridge");
      })
      .catch(() => {
        if (active) setStatus("Không đăng ký được phiên NFC đang chờ");
      });

    return () => {
      active = false;
      fetch("/api/nfc-session", {
        body: JSON.stringify({ transactionId }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      }).catch(() => undefined);
    };
  }, [amount, transactionId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetch(`/api/nfc-taps?transactionId=${encodeURIComponent(transactionId)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data: { tap: { cardRef: string; createdAt: string; transactionId: string } | null }) => {
          if (!data.tap || handledRef.current) return;
          const tapKey = `${data.tap.cardRef}:${data.tap.createdAt}`;
          if (tapKey === lastTapKeyRef.current) return;
          lastTapKeyRef.current = tapKey;
          if (data.tap.cardRef !== "CARD-POS-042") {
            setStatus(`Thẻ không khớp: ${data.tap.cardRef}`);
            onRetry("wrong_card");
            return;
          }
          handledRef.current = true;
          setStatus("Đã nhận tap NFC");
          onLog("nfc_tapped", "payment", { card_ref: data.tap.cardRef });
          onComplete(data.tap);
        })
        .catch(() => setStatus("Không đọc được trạng thái NFC bridge"));
    }, 800);

    return () => window.clearInterval(interval);
  }, [onComplete, onLog, onRetry, transactionId]);

  const simulateTap = async () => {
    const response = await fetch("/api/nfc-taps", {
      body: JSON.stringify({ cardRef: "CARD-POS-042", transactionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setStatus("Nút mô phỏng bị chặn bởi bridge token production");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-[#ead8bf] bg-[#fffaf3]">
        <div className="text-center">
          <Nfc className="mx-auto mb-4 text-[#405438]" size={60} aria-hidden />
          <p className="text-lg font-semibold">Chạm thẻ vào đầu đọc USB</p>
          <p className="mt-1 text-sm text-stone-500">{formatVnd(amount)}</p>
          <p className="mt-3 text-sm font-medium text-[#6f3f24]">{status}</p>
        </div>
      </div>
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3] disabled:bg-[#d6c0aa]"
        disabled={busy}
        onClick={simulateTap}
        type="button"
      >
        <Nfc size={17} aria-hidden />
        Mô phỏng bridge tap
      </button>
    </div>
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
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-[#ead8bf] bg-[#fffaf3]">
        <div className="text-center">
          <Icon className="mx-auto mb-4 text-[#7a4a2a]" size={60} aria-hidden />
          <p className="text-lg font-semibold">{label}</p>
          <p className="mt-1 text-sm text-stone-500">{formatVnd(amount)}</p>
        </div>
      </div>
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
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
      { code: "no_face", label: "Camera POS không thấy khuôn mặt" },
      { code: "multiple_faces", label: "Có nhiều khuôn mặt" },
      { code: "low_quality", label: "Hình ảnh camera POS chưa đủ rõ" },
      { code: "face_no_match", label: "Face ID không khớp mẫu" },
      { code: "camera_disconnected", label: "Camera POS mất kết nối" },
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
    <aside className="rounded-lg border border-[#ead8bf] bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <TimerReset size={18} aria-hidden />
        <h3 className="font-semibold">Thử lại và lỗi</h3>
      </div>
      <p className="text-sm leading-6 text-stone-600">
        Tối đa hai lần thử lại. Sau đó hệ thống ghi nhận lỗi kỹ thuật và mở
        khảo sát sau trải nghiệm.
      </p>
      <div className="mt-3 space-y-2">
        {errors[group].map((error) => (
          <button
            className="inline-flex h-10 w-full items-center justify-start gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-left text-sm font-medium text-stone-700 transition hover:bg-[#fffaf3] disabled:text-[#b8a491]"
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
      <div className="mt-4 rounded-lg bg-[#fffaf3] px-3 py-2 text-sm text-stone-600">
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
      <div className="rounded-lg border border-[#ead8bf] bg-white p-4 text-sm leading-6 text-stone-600">
        <p>
          Phiên này so sánh trải nghiệm thanh toán tại điểm bán giữa QR + PIN,
          thẻ NFC, Face ID tại POS và PalmPay tĩnh mạch lòng bàn tay. Trọng tâm
          là cảm nhận về sự đơn giản, thuận tiện, hữu ích, bảo mật, quyền riêng
          tư, niềm tin và ý định sử dụng.
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
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
          onClick={onExport}
          type="button"
        >
          <Download size={17} aria-hidden />
          Bảng 4 sheet
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
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
    <section className="rounded-lg border border-[#ead8bf] bg-white p-5 shadow-sm">
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
    <div className="mt-5 flex justify-end border-t border-[#ead8bf] pt-4">
      {children}
    </div>
  );
}

type CustomSelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

function CustomSelect({
  onChange,
  options,
  placeholder,
  size = "md",
  value,
}: {
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder: string;
  size?: "sm" | "md";
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const nextFocus = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocus)) {
          setOpen(false);
        }
      }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-3 text-left text-sm outline-none transition hover:border-[#c9955d] focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]",
          size === "sm" ? "h-10" : "h-11",
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        type="button"
      >
        <span className={cn(selected ? "text-stone-950" : "text-stone-500")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-stone-400 transition",
            open && "rotate-180 text-[#7a4a2a]",
          )}
          size={16}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-lg border border-[#d6b896] bg-[#fffaf3] p-1 shadow-lg shadow-stone-900/10"
          role="listbox"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                aria-selected={active}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition",
                  active
                    ? "font-semibold text-[#6f3f24]"
                    : "text-stone-700 hover:bg-[#fff3df]",
                  option.disabled && "cursor-not-allowed text-[#b8a491] hover:bg-transparent",
                )}
                disabled={option.disabled}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                <Check
                  className={cn("shrink-0", !active && "opacity-0")}
                  size={15}
                  aria-hidden
                />
                {option.label}
              </button>
            );
          })}
        </div>
      )}
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
    <div className="flex items-center justify-between gap-4 border-b border-[#f0dfc8] py-2 last:border-0">
      <span className="text-sm text-stone-500">{label}</span>
      <span className={cn("text-right text-sm", strong ? "font-semibold text-stone-950" : "font-medium text-stone-700")}>
        {value}
      </span>
    </div>
  );
}
