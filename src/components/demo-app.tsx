"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Coffee,
  Download,
  ExternalLink,
  FileSpreadsheet,
  GraduationCap,
  Hand,
  IdCard,
  Loader2,
  LockKeyhole,
  MapPin,
  Minus,
  Nfc,
  Phone,
  PlayCircle,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  ScanFace,
  ScanLine,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Smartphone,
  TimerReset,
  User,
  UserPlus,
  WalletCards,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import surveyConfig from "@/data/survey-questions.json";
import {
  catalog,
  catalogCategories,
  catalogCategoryLabels,
  formatVnd,
  getProduct,
} from "@/lib/catalog";
import type {
  CartLine,
  Locale,
  LocalizedText,
  Product,
  ProductCategory,
} from "@/lib/types";

type StudyGroup = "QR_PIN" | "NFC_CARD" | "FACE_POS" | "PALM_VEIN";
type ExportFormat = "csv" | "xlsx";
type Cart = Record<string, number>;
type StepKey =
  | "admin"
  | "consent"
  | "pre"
  | "setup"
  | "product"
  | "checkout"
  | "payment"
  | "success"
  | "post"
  | "debrief";

type SurveyQuestion = {
  item_id: string;
  construct: string;
  construct_label?: string | LocalizedText;
  section_intro?: string | LocalizedText;
  source_text?: string;
  text: string | LocalizedText;
  emphasis?: string[] | Partial<Record<Locale, string[]>>;
  scale_min?: number;
  scale_max?: number;
  type?: "select";
  options?: string[] | Record<Locale, string[]>;
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

type PalmSdkClientResult = {
  attempts?: number;
  capTip?: number | null;
  deviceName?: string;
  distance?: number | null;
  error?: string;
  event?: "enrolled" | "matched";
  featureBytes?: number;
  framesSeen?: number;
  highBright?: number;
  imageHeight?: number;
  imageWidth?: number;
  message?: string;
  ok?: boolean;
  palmBox?: {
    height: number;
    status: number;
    width: number;
    x: number;
    y: number;
  };
  palmBright?: number;
  palmStatus?: number;
  previewHeight?: number;
  previewImage?: string;
  previewWidth?: number;
  sampleCount?: number;
  sampleGoal?: number;
  sdkReturn?: number | null;
  sdkVersion?: string;
  streamType?: "ready" | "scan" | "done";
  templateRef?: string;
  threshold?: number;
};

function palmSdkClientMessage(
  result: PalmSdkClientResult | null,
  locale: Locale,
  phase: "enroll" | "verify",
) {
  if (result?.message && !result.message.includes("[palm-sdk]")) {
    return result.message;
  }

  if (result?.error === "sdk_timeout") {
    return locale === "vi"
      ? "Máy quét phản hồi quá lâu. Đặt lại lòng bàn tay rồi thử lại."
      : "The scanner took too long. Place your palm again and retry.";
  }
  if (result?.error === "template_not_found") {
    return locale === "vi"
      ? "Chưa có mẫu palm vein cho phiên này. Hãy đăng ký lại trước khi thanh toán."
      : "No palm vein template is available for this session. Enroll again before payment.";
  }
  if (result?.error === "stream_closed") {
    return locale === "vi"
      ? "Luong preview may quet da dong truoc khi nhan ket qua cuoi. Hay giu tay trong khung va thu lai."
      : "The scanner preview ended before the final result arrived. Keep your palm in frame and retry.";
  }
  if (result?.sdkReturn === -7) {
    return locale === "vi"
      ? "Máy quét chưa thấy lòng bàn tay. Đặt lòng bàn tay vào vùng quét rồi thử lại."
      : "The scanner cannot see a palm yet. Place your palm in the scan area and retry.";
  }
  if (result?.sdkReturn === -38) {
    return locale === "vi"
      ? "Mẫu palm vein chưa đủ rõ. Giữ tay ổn định và thử lại."
      : "The palm vein sample is not clear enough. Hold still and retry.";
  }
  if (result?.sdkReturn === -1000) {
    return locale === "vi"
      ? "SDK chưa kích hoạt được với thiết bị palm vein."
      : "The palm vein SDK could not activate with the scanner.";
  }

  if (phase === "verify") {
    return locale === "vi" ? "Palm vein chưa khớp. Có thể thử lại." : "Palm vein did not match. You can retry.";
  }
  return locale === "vi"
    ? "Đăng ký palm vein chưa thành công. Đặt lại lòng bàn tay rồi thử lại."
    : "Palm vein enrollment failed. Place your palm again and retry.";
}

function palmSdkScanHint(
  result: PalmSdkClientResult | null | undefined,
  locale: Locale,
  phase: "enroll" | "verify",
) {
  if (!result) {
    return phase === "enroll"
      ? locale === "vi"
        ? "Đặt lòng bàn tay vào vùng quét."
        : "Place your palm in the scan area."
      : locale === "vi"
        ? "Đặt lòng bàn tay để xác minh."
        : "Place your palm to verify.";
  }

  if (result.sampleGoal && typeof result.sampleCount === "number") {
    if (result.sampleCount >= result.sampleGoal) {
      return locale === "vi" ? "Đã ghi đủ mẫu palm vein." : "Palm vein samples captured.";
    }
    if (result.sdkReturn === 0) {
      return locale === "vi"
        ? `Đã ghi mẫu ${result.sampleCount}/${result.sampleGoal}. Giữ tay ổn định.`
        : `Captured ${result.sampleCount}/${result.sampleGoal}. Keep your palm steady.`;
    }
  }

  const tips: Record<number, LocalizedText> = {
    1: { vi: "Đưa lòng bàn tay vào vùng quét.", en: "Move your palm into the scan area." },
    2: { vi: "Tay đang quá gần. Nâng tay xa máy hơn một chút.", en: "Your palm is too close. Move it slightly farther away." },
    3: { vi: "Tay đang quá xa. Đưa tay lại gần máy hơn.", en: "Your palm is too far. Move it closer." },
    4: { vi: "Ánh sáng chưa phù hợp. Giữ tay che đều vùng quét.", en: "Lighting is not ideal. Cover the scan area evenly." },
    5: { vi: "Giữ tay ổn định trong giây lát.", en: "Hold your palm steady for a moment." },
    6: { vi: "Xoay lòng bàn tay thẳng với máy quét.", en: "Align your palm straight with the scanner." },
    7: { vi: "Dịch lòng bàn tay xuống thấp hơn.", en: "Move your palm down." },
    8: { vi: "Dịch lòng bàn tay lên cao hơn.", en: "Move your palm up." },
    9: { vi: "Dịch lòng bàn tay sang trái.", en: "Move your palm left." },
    10: { vi: "Dịch lòng bàn tay sang phải.", en: "Move your palm right." },
    20: { vi: "Đã nhận được mẫu. Tiếp tục giữ tay.", en: "Sample captured. Keep holding your palm." },
    100: { vi: "Hoàn tất quét palm vein.", en: "Palm vein scan complete." },
  };

  if (typeof result.capTip === "number" && tips[result.capTip]) {
    return localizeText(tips[result.capTip], locale);
  }
  if (result.sdkReturn === -7) {
    return locale === "vi"
      ? "Máy quét chưa thấy lòng bàn tay. Đưa tay vào giữa khung."
      : "The scanner cannot see your palm yet. Move it into the center.";
  }
  if (result.sdkReturn === -38) {
    return locale === "vi"
      ? "Mẫu chưa đủ rõ. Giữ tay ổn định và thẳng hơn."
      : "The sample is not clear enough. Hold steady and align your palm.";
  }
  if (result.palmStatus) {
    return locale === "vi"
      ? "Đã thấy lòng bàn tay. Giữ nguyên vị trí."
      : "Palm detected. Hold this position.";
  }

  return phase === "enroll"
    ? locale === "vi"
      ? "Đang tìm lòng bàn tay trong vùng quét."
      : "Looking for your palm in the scan area."
    : locale === "vi"
      ? "Đang đối chiếu mẫu palm vein."
      : "Matching the palm vein sample.";
}

function palmApiUrl(path: string) {
  const configured = process.env.NEXT_PUBLIC_PALMPAY_PALM_API_URL?.trim().replace(/\/$/, "");
  if (configured) return `${configured}${path}`;

  if (typeof window !== "undefined" && window.location.hostname === "demo-experiment.vercel.app") {
    return `http://localhost:7999${path}`;
  }

  return path;
}

function runPalmSdkEventScan(
  action: "enroll" | "verify",
  input: { participantId?: string; templateRef: string; transactionId?: string },
  onScan: (event: PalmSdkClientResult) => void,
) {
  return new Promise<PalmSdkClientResult>((resolve, reject) => {
    const params = new URLSearchParams({ templateRef: input.templateRef });
    if (input.participantId) params.set("participantId", input.participantId);
    if (input.transactionId) params.set("transactionId", input.transactionId);

    const source = new EventSource(
      palmApiUrl(`/api/palm/${action}/stream?${params.toString()}`),
    );
    let completed = false;
    let lastScan: PalmSdkClientResult | null = null;
    const parseEvent = (event: MessageEvent) => JSON.parse(event.data) as PalmSdkClientResult;

    source.addEventListener("ready", (event) => {
      lastScan = parseEvent(event as MessageEvent);
      onScan(lastScan);
    });
    source.addEventListener("scan", (event) => {
      lastScan = parseEvent(event as MessageEvent);
      onScan(lastScan);
    });
    source.addEventListener("done", (event) => {
      completed = true;
      source.close();
      resolve(parseEvent(event as MessageEvent));
    });
    source.onerror = () => {
      if (completed) return;
      completed = true;
      source.close();
      if (lastScan) {
        resolve({
          ...lastScan,
          ok: false,
          error: "stream_closed",
          message: "",
          streamType: "done",
        });
        return;
      }
      reject(new Error("Palm scanner stream disconnected before the scanner returned any data"));
    };
  });
}

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
  nfc_card_ref?: string | null;
  personal_info?: ParticipantPersonalInfo;
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

const protocolVersion = "PALMPAY-POS-2026.06";
const startingBalance = 100000;
const faceMatchThreshold = 0.55;
const defaultNfcCardRef = "CARD-POS-042";
const defaultPersonalInfo: ParticipantPersonalInfo = {
  address: "279 Nguyễn Tri Phương, Phường Diên Hồng, Thành phố Hồ Chí Minh",
  cccd: "079204000001",
  phone: "0901234567",
};

const storageKeys = {
  currentSession: "palmpay.pos.currentSession",
  completedSessions: "palmpay.pos.completedSessions",
  participantCounter: "palmpay.pos.participantCounter",
  assignmentQueue: "palmpay.pos.assignmentQueue",
  assignmentHistory: "palmpay.pos.assignmentHistory",
};
const localeStorageKey = "palmpay.pos.locale";

const groupOrder: StudyGroup[] = ["QR_PIN", "NFC_CARD", "FACE_POS", "PALM_VEIN"];
const categoryOptions: Array<ProductCategory | "All"> = ["All", ...catalogCategories];
const surveySettings = surveyConfig as {
  default_locale?: Locale;
  post: SurveyQuestion[];
};
const defaultLocale: Locale = surveySettings.default_locale === "en" ? "en" : "vi";

const uiText = {
  admin: { vi: "Quản trị", en: "Admin" },
  appTitle: { vi: "Nghiên cứu PalmPay Coffee", en: "PalmPay Coffee Study" },
  balance: { vi: "Số dư", en: "Balance" },
  cart: { vi: "Giỏ hàng", en: "Cart" },
  checkout: { vi: "Xác nhận đơn hàng", en: "Order confirmation" },
  chooseAnswer: { vi: "Chọn câu trả lời", en: "Choose an answer" },
  chooseMethod: { vi: "Chọn phương thức", en: "Choose method" },
  complete: { vi: "Hoàn thành", en: "Complete" },
  completeSetup: { vi: "Hoàn tất đăng ký", en: "Finish setup" },
  confirmCart: { vi: "Xác nhận giỏ hàng", en: "Confirm cart" },
  dataCsv: { vi: "CSV dữ liệu", en: "Data CSV" },
  exportData: { vi: "Xuất dữ liệu", en: "Export data" },
  exportMethods: { vi: "Chọn phương thức để xuất", en: "Choose methods to export" },
  flowTitle: { vi: "Luồng thí nghiệm", en: "Experiment flow" },
  language: { vi: "Ngôn ngữ", en: "Language" },
  loading: { vi: "Đang tải", en: "Loading" },
  methodExcel: { vi: "Excel theo phương thức", en: "Excel by method" },
  newSession: { vi: "Phiên mới", en: "New session" },
  participantFallback: { vi: "Người tham gia", en: "Participant" },
  participantName: { vi: "Họ và tên", en: "Full name" },
  participantPlaceholder: { vi: "Ví dụ: Nguyễn Minh Anh", en: "Example: Nguyen Minh Anh" },
  payment: { vi: "Thanh toán", en: "Payment" },
  postSurveyEyebrow: { vi: "Phần 1 / 3", en: "Part 1 / 3" },
  postSurveyTitle: {
    vi: "KHẢO SÁT TRẢI NGHIỆM THANH TOÁN ĐIỆN TỬ",
    en: "ELECTRONIC PAYMENT EXPERIENCE SURVEY",
  },
  postSurveyExperienceEyebrow: { vi: "Phần 2 / 3", en: "Part 2 / 3" },
  postSurveyExperienceTitle: {
    vi: "SECTION 1: ĐÁNH GIÁ CỦA BẠN VỀ TRẢI NGHIỆM VỪA RỒI",
    en: "SECTION 1: YOUR EVALUATION OF THE EXPERIENCE",
  },
  previous: { vi: "Quay lại", en: "Back" },
  selected: { vi: "Đã chọn", en: "Selected" },
  selectAll: { vi: "Chọn tất cả", en: "Select all" },
  startSession: { vi: "Bắt đầu phiên", en: "Start session" },
  surveyContinue: { vi: "Tiếp tục khảo sát", en: "Continue to survey" },
} satisfies Record<string, LocalizedText>;

type UiTextKey = keyof typeof uiText;

function localizeText(value: string | LocalizedText | undefined, locale = defaultLocale) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] ?? value.vi ?? value.en ?? "";
}

function t(key: UiTextKey, locale = defaultLocale) {
  return localizeText(uiText[key], locale);
}

function questionText(question: SurveyQuestion, locale = defaultLocale) {
  return localizeText(question.text, locale);
}

function questionEmphasis(question: SurveyQuestion, locale = defaultLocale) {
  const emphasis = question.emphasis ?? [];
  if (Array.isArray(emphasis)) return emphasis;
  return emphasis[locale] ?? emphasis.vi ?? emphasis.en ?? [];
}

function renderTextWithEmphasis(text: string, phrases: string[]) {
  const uniquePhrases = [...new Set(phrases.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (uniquePhrases.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let nextIndex = text.length;
    let nextPhrase = "";
    for (const phrase of uniquePhrases) {
      const index = text.indexOf(phrase, cursor);
      if (index !== -1 && index < nextIndex) {
        nextIndex = index;
        nextPhrase = phrase;
      }
    }

    if (!nextPhrase) {
      parts.push(text.slice(cursor));
      break;
    }
    if (nextIndex > cursor) {
      parts.push(text.slice(cursor, nextIndex));
    }
    parts.push(
      <strong className="font-bold" key={`${nextPhrase}-${nextIndex}`}>
        {nextPhrase}
      </strong>,
    );
    cursor = nextIndex + nextPhrase.length;
  }

  return parts;
}

function constructLabel(question: SurveyQuestion, locale = defaultLocale) {
  return localizeText(question.construct_label, locale) || question.construct;
}

function questionOptions(question: SurveyQuestion, locale = defaultLocale) {
  const options = question.options ?? [];
  if (Array.isArray(options)) return options;
  return options[locale] ?? options.vi ?? options.en ?? [];
}

function productName(product: Product, locale = defaultLocale) {
  return localizeText(product.nameI18n, locale) || product.name;
}

function productDetail(product: Product, locale = defaultLocale) {
  return localizeText(product.detailI18n, locale) || product.detail;
}

function productImageAlt(product: Product, locale = defaultLocale) {
  return localizeText(product.imageAltI18n, locale) || product.imageAlt;
}

function productTags(product: Product, locale = defaultLocale) {
  return product.tagsI18n?.[locale] ?? product.tagsI18n?.vi ?? product.tags;
}

function categoryLabel(category: ProductCategory | "All", locale = defaultLocale) {
  if (category === "All") return locale === "vi" ? "Tất cả" : "All";
  return localizeText(catalogCategoryLabels[category], locale) || category;
}

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
    shortLabel: "Thẻ NFC",
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
      "Ghi mẫu khuôn mặt sau khi đồng ý tham gia, rồi xác nhận bằng camera POS ở bước thanh toán.",
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

const groupCopyEn: Record<
  StudyGroup,
  Pick<
    (typeof groupCopy)[StudyGroup],
    "device" | "instruction" | "label" | "neutralDescription" | "shortLabel"
  >
> = {
  QR_PIN: {
    label: "QR code + PIN",
    shortLabel: "QR + PIN",
    device: "Test phone",
    neutralDescription:
      "Participants use the DemoBank app on the test phone to scan the store QR code, enter the amount, and confirm with a test PIN.",
    instruction:
      "Open DemoBank, scan the POS QR code, enter the correct amount, and confirm with the test PIN.",
  },
  NFC_CARD: {
    label: "NFC contactless card",
    shortLabel: "NFC card",
    device: "NFC card + reader",
    neutralDescription:
      "Participants use the test NFC card to tap the reader at the point of sale for a small-value transaction.",
    instruction:
      "Tap the test NFC card on the reader when prompted. This session does not require a PIN.",
  },
  FACE_POS: {
    label: "Face ID at POS",
    shortLabel: "Face ID",
    device: "POS camera",
    neutralDescription:
      "Participants register their name and face before the session, then confirm payment directly with the POS camera.",
    instruction:
      "Record the face sample, then confirm with the POS camera during payment.",
  },
  PALM_VEIN: {
    label: "PalmPay palm vein recognition",
    shortLabel: "PalmPay",
    device: "PalmPay scanner",
    neutralDescription:
      "Participants place their palm over the PalmPay scanner so the system can match the registered palm vein sample.",
    instruction:
      "Place your palm over the scanner at the guided distance until the sample is matched successfully.",
  },
};

function groupCopyFor(group: StudyGroup, locale = defaultLocale) {
  return locale === "en" ? { ...groupCopy[group], ...groupCopyEn[group] } : groupCopy[group];
}

const stepLabels: Record<StepKey, string> = {
  admin: "Quản trị",
  consent: "Đồng ý",
  pre: "Khảo sát trước",
  setup: "Đăng ký",
  product: "Sản phẩm",
  checkout: "Xác nhận",
  payment: "Thanh toán",
  success: "Thành công",
  post: "Khảo sát sau",
  debrief: "Giải thích",
};

const stepLabelsEn: Record<StepKey, string> = {
  admin: "Admin",
  consent: "Consent",
  pre: "Pre-survey",
  setup: "Setup",
  product: "Products",
  checkout: "Confirm",
  payment: "Payment",
  success: "Success",
  post: "Post-survey",
  debrief: "Debrief",
};

function stepLabel(step: StepKey, locale = defaultLocale) {
  return locale === "en" ? stepLabelsEn[step] : stepLabels[step];
}

const flowSteps: StepKey[] = [
  "consent",
  "setup",
  "product",
  "checkout",
  "payment",
  "success",
  "post",
  "debrief",
];

const postQuestions = surveySettings.post;
const profileSurveyConstruct = "RESPONDENT_PROFILE";

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

type NfcTapPayload = {
  cardRef: string;
  createdAt: string;
  transactionId: string;
};

type ParticipantPersonalInfo = {
  address: string;
  cccd: string;
  phone: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#7b4325] px-4 font-semibold text-white transition hover:bg-[#65371f] disabled:bg-[#d9c6b5]";
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5d2bb] bg-white px-3 font-semibold text-stone-700 transition hover:border-[#c99862] hover:bg-[#fffaf7] disabled:text-[#b8a491]";

function CoffeeLeafGraphic({
  className,
  coffeeClassName,
  leavesClassName,
}: {
  className?: string;
  coffeeClassName?: string;
  leavesClassName?: string;
}) {
  return (
    <div className={cn("pointer-events-none relative", className)} aria-hidden>
      <Image
        alt=""
        className={cn("absolute object-contain", leavesClassName)}
        height={1254}
        src="/leaves.png"
        width={1254}
      />
      <Image
        alt=""
        className={cn("absolute object-contain", coffeeClassName)}
        height={1254}
        src="/coffee.png"
        width={1254}
      />
    </div>
  );
}

function BrandLockup({
  compact = false,
  subtitle,
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Image
        alt=""
        aria-hidden
        className={cn("shrink-0", compact ? "h-7 w-7" : "h-9 w-9")}
        height={compact ? 28 : 36}
        priority
        src="/brand/palmpay-mark.svg"
        width={compact ? 28 : 36}
      />
      <div className="min-w-0">
        <p
          className={cn(
            "truncate leading-tight tracking-normal",
            compact ? "text-lg" : "text-xl",
          )}
        >
          <span className="font-extrabold text-[#7b4325]">PalmPay</span>{" "}
          <span className="font-medium text-[#21160f]">Coffee</span>
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs font-medium text-stone-500">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function NfcSignalMark({
  className,
  size = 56,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 56 56"
      width={size}
    >
      <path
        d="M18 21c3.6 3.8 3.6 10.2 0 14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M27 16c6.2 6.5 6.2 17.5 0 24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M36 11c8.8 9.1 8.8 24.9 0 34"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  );
}

function nowIso() {
  return new Date().toISOString();
}

function readLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  return window.localStorage.getItem(localeStorageKey) === "en" ? "en" : defaultLocale;
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

function summarizeCart(lines: CartLine[], locale = defaultLocale) {
  return lines
    .map((line) => {
      const item = getProduct(line.productId);
      return `${item ? productName(item, locale) : line.productId} x${line.quantity}`;
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

function redactBiometricForLocalStorage<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactBiometricForLocalStorage(item)) as T;
  }

  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "face_descriptor" ? null : redactBiometricForLocalStorage(item),
    ]),
  ) as T;
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
      return { activeSession: value };
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
  window.localStorage.setItem(
    key,
    JSON.stringify(redactBiometricForLocalStorage(value)),
  );
  const patch = storagePatch(key, value);
  if (patch) persistExperimentState(patch);
}

function removeJson(key: string) {
  window.localStorage.removeItem(key);
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
  window.localStorage.setItem(
    key,
    JSON.stringify(redactBiometricForLocalStorage(value)),
  );
}

function applyStateSnapshot(state: ExperimentStateSnapshot) {
  writeLocalJson(storageKeys.assignmentHistory, state.assignmentHistory);
  writeLocalJson(storageKeys.assignmentQueue, state.assignmentQueue);
  writeLocalJson(storageKeys.completedSessions, state.completedSessions);
  writeLocalJson(storageKeys.participantCounter, state.participantCounter);
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

function makeLocalParticipantId() {
  const current = readJson<number>(storageKeys.participantCounter, 0) + 1;
  writeJson(storageKeys.participantCounter, current);
  return `P${String(current).padStart(4, "0")}`;
}

async function allocateParticipantId() {
  try {
    const response = await fetch("/api/experiment-state/participant", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("Could not allocate participant id");
    }
    const data = (await response.json()) as { participantId?: unknown };
    if (typeof data.participantId === "string" && data.participantId.trim()) {
      return data.participantId;
    }
  } catch {
    // Offline/local fallback keeps the POS usable if the shared API is unreachable.
  }

  return makeLocalParticipantId();
}

function normalizePersonalInfo(value?: Partial<ParticipantPersonalInfo> | null) {
  return {
    address: value?.address?.trim() || defaultPersonalInfo.address,
    cccd: value?.cccd?.trim() || defaultPersonalInfo.cccd,
    phone: value?.phone?.trim() || defaultPersonalInfo.phone,
  };
}

function makeSession(
  participantName: string,
  participantId: string,
  selectedGroup: StudyGroup | null = null,
): ExperimentSession {
  const trimmedName = participantName.trim() || "Khách thử nghiệm";
  const createdAt = nowIso();

  return {
    participant_id: participantId,
    participant_name: trimmedName,
    protocol_version: protocolVersion,
    assigned_group: selectedGroup,
    created_at: createdAt,
    consent_at: null,
    pre_survey_completed_at: null,
    post_survey_completed_at: null,
    session_status: "created",
    current_step: "consent",
    biometric_consent_at: null,
    face_descriptor: null,
    face_account_name: trimmedName,
    nfc_card_ref: null,
    personal_info: { ...defaultPersonalInfo },
    qr_account_name: trimmedName,
    qr_pin: "",
    template_ref:
      selectedGroup === "FACE_POS" || selectedGroup === "PALM_VEIN"
        ? `tpl_${crypto.randomUUID().slice(0, 8)}`
        : null,
    template_deleted_at: null,
    setup_started_at: null,
    setup_completed_at: null,
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
  const participantName = session.participant_name?.trim() ?? "";
  const rawStep = session.current_step as string;
  if ((session.current_step as string) === "ranking") {
    return {
      ...session,
      face_descriptor: session.face_descriptor ?? null,
      face_account_name: session.face_account_name || participantName,
      nfc_card_ref: session.nfc_card_ref ?? null,
      participant_name: participantName,
      personal_info: normalizePersonalInfo(session.personal_info),
      qr_account_name: session.qr_account_name || participantName,
      current_step: "debrief" as StepKey,
    };
  }
  return {
    ...session,
    current_step:
      rawStep === "assignment"
        ? "product"
        : rawStep === "entry" || rawStep === "pre"
          ? "setup"
          : session.current_step,
    face_descriptor: session.face_descriptor ?? null,
    face_account_name: session.face_account_name || participantName,
    nfc_card_ref: session.nfc_card_ref ?? null,
    participant_name: participantName,
    personal_info: normalizePersonalInfo(session.personal_info),
    qr_account_name: session.qr_account_name || participantName,
    setup_started_at: session.setup_started_at ?? null,
    setup_completed_at: session.setup_completed_at ?? null,
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

function downloadLabeledCsv(
  filename: string,
  columns: ExportColumn[],
  rows: Array<Record<string, unknown>>,
) {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [
    columns.map((column) => escape(column.label)).join(","),
    ...rows.map((row) =>
      columns.map((column) => escape(row[column.key])).join(","),
    ),
  ].join("\n");
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

function normalizeSurveyAnswer(question: SurveyQuestion, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (question.type === "select") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    const index = questionOptions(question).findIndex((option) => option === value);
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

const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

type XlsxSheet = {
  name: string;
  rows: unknown[][];
};

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sanitizeSheetName(name: string, index: number) {
  const cleaned = name.replace(/[\[\]:*?/\\]/g, " ").trim();
  return (cleaned || `Sheet${index + 1}`).slice(0, 31);
}

function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function worksheetXml(rows: unknown[][]) {
  const maxColumns = Math.max(1, ...rows.map((row) => row.length));
  const dimension = `A1:${columnName(maxColumns - 1)}${Math.max(rows.length, 1)}`;
  const sheetData = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex)}${rowNumber}`;
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${cellRef}"><v>${value}</v></c>`;
          }

          const text =
            value === null || value === undefined
              ? ""
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);
          return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<dimension ref="${dimension}"/>`,
    `<sheetData>${sheetData}</sheetData>`,
    "</worksheet>",
  ].join("");
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function pushUint16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(bytes: number[], value: number) {
  bytes.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function zipTimestamp() {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
    time:
      (now.getHours() << 11) |
      (now.getMinutes() << 5) |
      Math.floor(now.getSeconds() / 2),
  };
}

function bytesFromNumbers(bytes: number[]) {
  return new Uint8Array(bytes);
}

function createZipBlob(files: Array<{ path: string; content: string }>) {
  const encoder = new TextEncoder();
  const timestamp = zipTimestamp();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);
    const localHeader: number[] = [];

    pushUint32(localHeader, 0x04034b50);
    pushUint16(localHeader, 20);
    pushUint16(localHeader, 0x0800);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, timestamp.time);
    pushUint16(localHeader, timestamp.date);
    pushUint32(localHeader, checksum);
    pushUint32(localHeader, contentBytes.length);
    pushUint32(localHeader, contentBytes.length);
    pushUint16(localHeader, nameBytes.length);
    pushUint16(localHeader, 0);

    const localHeaderBytes = bytesFromNumbers(localHeader);
    chunks.push(localHeaderBytes, nameBytes, contentBytes);

    const centralHeader: number[] = [];
    pushUint32(centralHeader, 0x02014b50);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 0x0800);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, timestamp.time);
    pushUint16(centralHeader, timestamp.date);
    pushUint32(centralHeader, checksum);
    pushUint32(centralHeader, contentBytes.length);
    pushUint32(centralHeader, contentBytes.length);
    pushUint16(centralHeader, nameBytes.length);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, 0);
    pushUint32(centralHeader, offset);
    centralDirectory.push(bytesFromNumbers(centralHeader), nameBytes);

    offset += localHeaderBytes.length + nameBytes.length + contentBytes.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce(
    (size, chunk) => size + chunk.length,
    0,
  );
  chunks.push(...centralDirectory);

  const endRecord: number[] = [];
  pushUint32(endRecord, 0x06054b50);
  pushUint16(endRecord, 0);
  pushUint16(endRecord, 0);
  pushUint16(endRecord, files.length);
  pushUint16(endRecord, files.length);
  pushUint32(endRecord, centralDirectorySize);
  pushUint32(endRecord, centralDirectoryOffset);
  pushUint16(endRecord, 0);
  chunks.push(bytesFromNumbers(endRecord));

  const output = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.length, 0),
  );
  let position = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, position);
    position += chunk.length;
  });

  return new Blob([output.buffer as ArrayBuffer], { type: XLSX_MIME_TYPE });
}

function createXlsxBlob(sheets: XlsxSheet[]) {
  const safeSheets = sheets.map((sheet, index) => ({
    ...sheet,
    name: sanitizeSheetName(sheet.name, index),
  }));
  const sheetOverrides = safeSheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const workbookSheets = safeSheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  const workbookRelationships = safeSheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");

  return createZipBlob([
    {
      path: "[Content_Types].xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        sheetOverrides,
        "</Types>",
      ].join(""),
    },
    {
      path: "_rels/.rels",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
        "</Relationships>",
      ].join(""),
    },
    {
      path: "xl/workbook.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        `<sheets>${workbookSheets}</sheets>`,
        "</workbook>",
      ].join(""),
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        workbookRelationships,
        "</Relationships>",
      ].join(""),
    },
    ...safeSheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet.rows),
    })),
  ]);
}

function baseMethodWorkbookColumns(locale = defaultLocale): ExportColumn[] {
  return [
    { key: "timestamp", label: locale === "vi" ? "Dấu thời gian" : "Timestamp" },
    { key: "participant_id", label: locale === "vi" ? "Mã người tham gia" : "Participant ID" },
    { key: "participant_name", label: locale === "vi" ? "Tên người tham gia" : "Participant name" },
    { key: "cccd", label: locale === "vi" ? "CCCD" : "Citizen ID" },
    { key: "phone", label: locale === "vi" ? "SĐT" : "Phone" },
    { key: "address", label: locale === "vi" ? "Địa chỉ" : "Address" },
    { key: "qr_account_name", label: locale === "vi" ? "Tên tài khoản QR" : "QR account name" },
    { key: "face_account_name", label: locale === "vi" ? "Tên đăng ký Face ID" : "Face ID registration name" },
    { key: "nfc_card_ref", label: locale === "vi" ? "Mã thẻ NFC" : "NFC card ref" },
    { key: "method_code", label: locale === "vi" ? "Mã phương thức" : "Method code" },
    { key: "method", label: locale === "vi" ? "Phương thức" : "Method" },
    { key: "method_label", label: locale === "vi" ? "Tên phương thức" : "Method label" },
    { key: "protocol_version", label: locale === "vi" ? "Phiên bản protocol" : "Protocol version" },
    { key: "created_at", label: locale === "vi" ? "Thời điểm tạo phiên" : "Session created at" },
    { key: "consent_at", label: locale === "vi" ? "Thời điểm đồng ý" : "Consent at" },
    { key: "setup_completed_at", label: locale === "vi" ? "Thời điểm hoàn tất đăng ký" : "Setup completed at" },
    { key: "checkout_completed_at", label: locale === "vi" ? "Thời điểm hoàn tất thanh toán" : "Checkout completed at" },
    { key: "session_status", label: locale === "vi" ? "Trạng thái phiên" : "Session status" },
    { key: "payment_status_code", label: locale === "vi" ? "Mã trạng thái thanh toán" : "Payment status code" },
    { key: "payment_status", label: locale === "vi" ? "Trạng thái thanh toán" : "Payment status" },
    { key: "transaction_id", label: locale === "vi" ? "Mã giao dịch" : "Transaction ID" },
    { key: "product_summary", label: locale === "vi" ? "Sản phẩm đã chọn" : "Selected products" },
    { key: "cart_total", label: locale === "vi" ? "Tổng tiền" : "Cart total" },
    { key: "cart_items", label: locale === "vi" ? "Chi tiết giỏ hàng" : "Cart details" },
    { key: "setup_duration", label: locale === "vi" ? "Thời lượng đăng ký (giây)" : "Setup duration (seconds)" },
    { key: "checkout_duration", label: locale === "vi" ? "Thời lượng thanh toán (giây)" : "Checkout duration (seconds)" },
    { key: "number_of_retries", label: locale === "vi" ? "Số lần thử lại" : "Retry count" },
    { key: "number_of_errors", label: locale === "vi" ? "Số lỗi" : "Error count" },
    { key: "assistance_required", label: locale === "vi" ? "Cần hỗ trợ" : "Assistance required" },
    { key: "template_deleted_at", label: locale === "vi" ? "Thời điểm xóa mẫu sinh trắc" : "Biometric template deleted at" },
  ];
}

function codebookColumns(locale = defaultLocale): ExportColumn[] {
  return [
    { key: "phase", label: locale === "vi" ? "Giai đoạn khảo sát" : "Survey phase" },
    { key: "item_id", label: locale === "vi" ? "Mã biến quan sát" : "Item ID" },
    { key: "construct", label: locale === "vi" ? "Mã khái niệm" : "Construct code" },
    { key: "construct_label_vi", label: "Khái niệm (VI)" },
    { key: "construct_label_en", label: "Construct (EN)" },
    { key: "question_vi", label: "Câu hỏi đo lường (VI)" },
    { key: "question_en", label: "Measurement item (EN)" },
    { key: "source_text", label: locale === "vi" ? "Câu gốc" : "Source text" },
    { key: "type", label: locale === "vi" ? "Loại câu hỏi" : "Question type" },
    { key: "options_vi", label: "Lựa chọn (VI)" },
    { key: "options_en", label: "Options (EN)" },
    { key: "scale_min", label: "Likert min" },
    { key: "scale_max", label: "Likert max" },
    { key: "reverse_scored", label: locale === "vi" ? "Đảo chiều" : "Reverse scored" },
    { key: "required", label: locale === "vi" ? "Bắt buộc" : "Required" },
  ];
}

function surveyExportColumns(
  phase: "post",
  questions: SurveyQuestion[],
  locale = defaultLocale,
) {
  return questions.map((question) => ({
    key: `${phase}_${question.item_id}`,
    label: [
      phase.toUpperCase(),
      question.item_id,
      constructLabel(question, locale),
      questionText(question, locale),
      question.type === "select"
        ? questionOptions(question, locale).join(" / ")
        : `${question.scale_min ?? 1}-${question.scale_max ?? 7}`,
    ].join(" | "),
  }));
}

function methodWorkbookColumns(locale = defaultLocale): ExportColumn[] {
  return [
    ...baseMethodWorkbookColumns(locale),
    ...surveyExportColumns("post", postQuestions, locale),
  ];
}

function buildSurveyCodebookRows(): Array<Record<string, unknown>> {
  return postQuestions.map((question) => ({
    phase: "post",
    item_id: question.item_id,
    construct: question.construct,
    construct_label_vi: constructLabel(question, "vi"),
    construct_label_en: constructLabel(question, "en"),
    question_vi: questionText(question, "vi"),
    question_en: questionText(question, "en"),
    source_text: question.source_text ?? "",
    type: question.type ?? "likert",
    options_vi: questionOptions(question, "vi").join(" | "),
    options_en: questionOptions(question, "en").join(" | "),
    scale_min: question.scale_min ?? "",
    scale_max: question.scale_max ?? "",
    reverse_scored: question.reverse_scored ? 1 : 0,
    required: question.required ? 1 : 0,
  }));
}

function buildMethodWorkbookRow(session: ExperimentSession, locale = defaultLocale) {
  const group = session.assigned_group;
  const personalInfo = normalizePersonalInfo(session.personal_info);
  const row: Record<string, unknown> = {
    timestamp:
      session.post_survey_completed_at ??
      session.checkout_completed_at ??
      session.created_at,
    participant_id: session.participant_id,
    participant_name: session.participant_name,
    address: personalInfo.address,
    cccd: personalInfo.cccd,
    nfc_card_ref: session.nfc_card_ref ?? "",
    phone: personalInfo.phone,
    qr_account_name: session.qr_account_name ?? "",
    face_account_name: session.face_account_name ?? "",
    method_code: methodCode(group),
    method: group ?? "",
    method_label: group ? groupCopyFor(group, locale).label : "",
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

  postQuestions.forEach((question) => {
    row[`post_${question.item_id}`] = normalizeSurveyAnswer(
      question,
      session.post_answers[question.item_id],
    );
  });

  return row;
}

function downloadMethodWorkbook(
  filename: string,
  sessions: ExperimentSession[],
  locale = defaultLocale,
  selectedGroups: StudyGroup[] = groupOrder,
) {
  const columns = methodWorkbookColumns(locale);
  const codebookSheetColumns = codebookColumns(locale);
  const codebookRows = buildSurveyCodebookRows();
  const selected = new Set(selectedGroups);
  const sheets: XlsxSheet[] = [
    ...groupOrder.filter((group) => selected.has(group)).map((group) => {
      const rows = sessions
        .filter((session) => session.assigned_group === group)
        .map((session) => buildMethodWorkbookRow(session, locale));

      return {
        name: group,
        rows: [
          columns.map((column) => column.label),
          ...rows.map((row) => columns.map((column) => row[column.key])),
        ],
      };
    }),
    {
      name: "Codebook",
      rows: [
        codebookSheetColumns.map((column) => column.label),
        ...codebookRows.map((row) =>
          codebookSheetColumns.map((column) => row[column.key]),
        ),
      ],
    },
  ];

  downloadBlob(filename, createXlsxBlob(sheets));
}

function downloadMethodCsv(
  filename: string,
  sessions: ExperimentSession[],
  locale = defaultLocale,
  selectedGroups: StudyGroup[] = groupOrder,
) {
  const columns = methodWorkbookColumns(locale);
  downloadLabeledCsv(
    filename,
    columns,
    filterSessionsByMethods(sessions, selectedGroups).map((session) =>
      buildMethodWorkbookRow(session, locale),
    ),
  );
}

function filterSessionsByMethods(
  sessions: ExperimentSession[],
  selectedGroups: StudyGroup[],
) {
  const selected = new Set(selectedGroups);
  return sessions.filter(
    (session) => session.assigned_group && selected.has(session.assigned_group),
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
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const cartLines = useMemo(() => cartToLines(session?.cart), [session?.cart]);
  const totalCents = useMemo(() => cartTotal(cartLines), [cartLines]);

  useEffect(() => {
    window.queueMicrotask(async () => {
      setLocale(readLocale());
      const paymentId = new URLSearchParams(window.location.search).get("qrPay");
      if (paymentId) {
        setQrPaymentId(paymentId);
        setHydrated(true);
        return;
      }
      const localSession = normalizeSession(
        readJson<ExperimentSession | null>(storageKeys.currentSession, null),
      );
      try {
        const state = await loadExperimentState();
        applyStateSnapshot(state);
        setSession(localSession);
      } catch {
        setSession(localSession);
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = locale;
    window.localStorage.setItem(localeStorageKey, locale);
  }, [hydrated, locale]);

  useEffect(() => {
    if (!hydrated) return;
    if (session) {
      writeJson(storageKeys.currentSession, session);
    } else {
      removeJson(storageKeys.currentSession);
    }
  }, [hydrated, session]);

  useEffect(() => {
    if (!hydrated || !session?.current_step) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ left: 0, top: 0 });
    });
  }, [hydrated, session?.current_step]);

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

  const startNewSession = async (
    participantName: string,
    selectedGroup: StudyGroup,
  ) => {
    const participantId = await allocateParticipantId();
    const next = makeSession(participantName, participantId, selectedGroup);
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
            participant_name: next.participant_name,
            protocol_version: next.protocol_version,
            sensitive_setup_deferred: true,
            registration_location: "participant_flow",
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
      product_summary: summarizeCart(cartLines, locale),
    });
  };

  const completeConsent = () => {
    const timestamp = nowIso();
    updateSession((current) => {
      const hasSelectedGroup = Boolean(current.assigned_group);
      const assignedGroup =
        current.assigned_group ??
        getNextAssignment(current.participant_id, current.participant_name);
      return {
        ...current,
        consent_at: timestamp,
        assigned_group: assignedGroup,
        current_step: "setup",
        session_status: "active",
        setup_started_at: current.setup_started_at ?? timestamp,
        setup_completed_at: null,
        template_ref:
          current.template_ref ??
          (assignedGroup === "FACE_POS" || assignedGroup === "PALM_VEIN"
            ? `tpl_${crypto.randomUUID().slice(0, 8)}`
            : null),
        events: [
          ...current.events,
          {
            event_name: "consent_completed",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "consent",
            metadata: {},
          },
          {
            event_name: hasSelectedGroup
              ? "selected_group_confirmed"
              : "random_group_assigned",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "consent",
            metadata: {
              assigned_group: assignedGroup,
              block_randomized: !hasSelectedGroup,
            },
          },
          {
            event_name: "setup_started",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "setup",
            metadata: { assigned_group: assignedGroup },
          },
        ],
      };
    });
  };

  const completeSetup = (metadata: Record<string, unknown> = {}) => {
    updateSession((current) => {
      const timestamp = nowIso();
      return {
        ...current,
        current_step: "product",
        setup_started_at: current.setup_started_at ?? timestamp,
        setup_completed_at: timestamp,
        events: [
          ...current.events,
          {
            event_name: "setup_completed",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "setup",
            metadata: {
              assigned_group: current.assigned_group,
              ...metadata,
            },
          },
          {
            event_name: "product_started",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "product",
            metadata: { assigned_group: current.assigned_group },
          },
        ],
      };
    });
  };

  const updateQrPin = (pin: string) => {
    updateSession((current) => ({
      ...current,
      qr_pin: pin,
    }));
  };

  const updatePersonalInfo = (personalInfo: ParticipantPersonalInfo) => {
    updateSession((current) => ({
      ...current,
      personal_info: personalInfo,
    }));
  };

  const recordBiometricConsent = () => {
    updateSession((current) => {
      if (current.biometric_consent_at) return current;
      const timestamp = nowIso();
      return {
        ...current,
        biometric_consent_at: timestamp,
        events: [
          ...current.events,
          {
            event_name: "biometric_consent_completed",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "setup",
            metadata: { assigned_group: current.assigned_group },
          },
        ],
      };
    });
  };

  const recordNfcEnrollment = (tap: NfcTapPayload) => {
    updateSession((current) => {
      const timestamp = nowIso();
      return {
        ...current,
        nfc_card_ref: tap.cardRef,
        events: [
          ...current.events,
          {
            event_name: "nfc_card_enrollment_completed",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "setup",
            metadata: {
              card_ref: tap.cardRef,
              setup_transaction_id: tap.transactionId,
            },
          },
        ],
      };
    });
  };

  const recordFaceEnrollment = (
    descriptor: number[],
    metadata: Record<string, unknown>,
  ) => {
    updateSession((current) => {
      const timestamp = nowIso();
      return {
        ...current,
        face_descriptor: descriptor,
        events: [
          ...current.events,
          {
            event_name: "face_enrollment_completed",
            timestamp,
            participant_id: current.participant_id,
            screen_name: "setup",
            metadata,
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
          product: summarizeCart(selectedItems, locale),
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
              product_summary: summarizeCart(selectedItems, locale),
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
    if (session?.assigned_group === "PALM_VEIN" && session.template_ref) {
      fetch(palmApiUrl("/api/palm/delete"), {
        body: JSON.stringify({ templateRef: session.template_ref }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }).catch(() => undefined);
    }

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
    return <LoadingScreen locale={locale} />;
  }

  if (qrPaymentId) {
    return <QrMobilePayment locale={locale} transferId={qrPaymentId} />;
  }

  if (!session) {
    return (
      <AdminHome
        locale={locale}
        onCreate={startNewSession}
        onLocaleChange={setLocale}
      />
    );
  }

  const payableAmount = session.transaction?.amount ?? totalCents;

  return (
    <main className="min-h-screen bg-[#fbf7f1] text-stone-950">
      <ExperimentHeader
        locale={locale}
        onLocaleChange={setLocale}
        session={session}
        onReset={resetCurrentSession}
      />
      <div className="mx-auto grid max-w-[1200px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:max-w-[1540px]">
        <ProgressRail
          currentStep={session.current_step}
          group={session.assigned_group}
          locale={locale}
        />
        <section className="min-w-0">
          {session.current_step === "consent" && (
            <ConsentScreen locale={locale} onContinue={completeConsent} />
          )}
          {session.current_step === "setup" && session.assigned_group && (
            <SetupScreen
              biometricConsentAt={session.biometric_consent_at}
              faceAccountName={session.face_account_name ?? session.participant_name}
              faceDescriptor={session.face_descriptor}
              group={session.assigned_group}
              locale={locale}
              nfcCardRef={session.nfc_card_ref}
              onBiometricConsent={recordBiometricConsent}
              onComplete={completeSetup}
              onFaceEnroll={recordFaceEnrollment}
              onNfcEnroll={recordNfcEnrollment}
              onPersonalInfoChange={updatePersonalInfo}
              onQrPinChange={updateQrPin}
              participantId={session.participant_id}
              participantName={session.participant_name}
              personalInfo={session.personal_info ?? defaultPersonalInfo}
              qrPin={session.qr_pin ?? ""}
              templateRef={session.template_ref}
            />
          )}
          {session.current_step === "product" && (
            <ProductScreen
              cart={session.cart ?? {}}
              cartLines={cartLines}
              locale={locale}
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
              locale={locale}
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
              locale={locale}
              pin={session.qr_pin ?? ""}
              productSummary={
                session.transaction?.product ?? summarizeCart(cartLines, locale)
              }
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
              participantId={session.participant_id}
              nfcCardRef={session.nfc_card_ref}
              templateRef={session.template_ref}
            />
          )}
          {session.current_step === "success" && (
            <SuccessScreen
              locale={locale}
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
              eyebrow={t("postSurveyEyebrow", locale)}
              locale={locale}
              onAnswer={(itemId, value) =>
                updateSession((current) => ({
                  ...current,
                  post_answers: { ...current.post_answers, [itemId]: value },
                }))
              }
              onSubmit={completePostSurvey}
              questions={postQuestions}
              title={t("postSurveyTitle", locale)}
            />
          )}
          {session.current_step === "debrief" && (
            <DebriefScreen
              locale={locale}
              session={session}
              onExport={(selectedGroups) =>
                downloadMethodWorkbook(
                  "palmpay-method-sheets.xlsx",
                  allStoredSessions(session),
                  locale,
                  selectedGroups,
                )
              }
              onExportCsv={(selectedGroups) =>
                downloadMethodCsv(
                  "palmpay-wide.csv",
                  allStoredSessions(session),
                  locale,
                  selectedGroups,
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

function LoadingScreen({ locale = defaultLocale }: { locale?: Locale }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbf7f1]">
      <div className="inline-flex items-center gap-3 rounded-lg border border-[#ead8bf] bg-white px-4 py-3 text-sm text-stone-600">
        <Loader2 className="animate-spin" size={18} aria-hidden />
        {t("loading", locale)}
      </div>
    </div>
  );
}

function QrMobilePayment({
  locale = defaultLocale,
  transferId,
}: {
  locale?: Locale;
  transferId: string;
}) {
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
    return <LoadingScreen locale={locale} />;
  }

  return (
    <main className="min-h-screen bg-[#fbf7f1] px-4 py-6 text-stone-950">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-sm flex-col rounded-lg border border-[#ead8bf] bg-white p-4">
        <div className="flex flex-1 flex-col rounded-lg bg-[#fffaf3] p-5">
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
                <Row label={locale === "vi" ? "Người gửi" : "Sender"} value={transfer.senderName} />
                <Row label={locale === "vi" ? "Người nhận" : "Receiver"} value={transfer.receiverName} />
                <Row label={locale === "vi" ? "Sản phẩm" : "Products"} value={transfer.productSummary} />
                <Row label={locale === "vi" ? "Số tiền" : "Amount"} value={formatVnd(transfer.amount)} strong />
              </div>

              {transfer.status === "paid" ? (
                <div className="mt-5 rounded-lg border border-[#d8b88b] bg-[#fff3df] p-5 text-center text-[#4f2f1c]">
                  <CheckCircle2 className="mx-auto mb-3" size={36} aria-hidden />
                  <h2 className="text-xl font-semibold">
                    {locale === "vi" ? "Thanh toán hoàn tất" : "Payment complete"}
                  </h2>
                  <p className="mt-2 text-sm">
                    {locale === "vi" ? "Mã xác nhận" : "Confirmation code"}:{" "}
                    {transfer.authorizationCode ?? "QR-PAID"}
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
                        {locale === "vi" ? "Nhập PIN DemoBank" : "Enter DemoBank PIN"}
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
                      {busy
                        ? locale === "vi" ? "Đang xác minh..." : "Verifying..."
                        : locale === "vi" ? "Xác nhận thanh toán" : "Confirm payment"}
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

          {error && transfer && transfer.status !== "paid" && (
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
      const unavailable = getCameraUnavailableMessage();
      if (unavailable) throw new Error(unavailable);
      const loadedApi = api ?? (await loadFaceApiModels());
      setApi(loadedApi);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setMessage("Camera đã sẵn sàng");
    } catch (cameraError) {
      setMessage("Không mở được camera");
      onError(cameraErrorMessage(cameraError));
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
        <video
          autoPlay
          className="h-full w-full object-cover"
          muted
          playsInline
          ref={videoRef}
        />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/80">
            Camera Face ID
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
  locale,
  onCreate,
  onLocaleChange,
}: {
  locale: Locale;
  onCreate: (
    participantName: string,
    selectedGroup: StudyGroup,
  ) => Promise<void> | void;
  onLocaleChange: (locale: Locale) => void;
}) {
  const [completed, setCompleted] = useState<ExperimentSession[]>([]);
  const [creating, setCreating] = useState(false);
  const [pendingExportFormat, setPendingExportFormat] = useState<ExportFormat | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<StudyGroup>(groupOrder[0]);

  useEffect(() => {
    window.queueMicrotask(async () => {
      try {
        const state = await loadExperimentState();
        applyStateSnapshot(state);
        setCompleted(state.completedSessions);
      } catch {
        setCompleted(readJson<ExperimentSession[]>(storageKeys.completedSessions, []));
      }
    });
  }, []);

  const counts = groupOrder.map((group) => ({
    group,
    count: completed.filter((item) => item.assigned_group === group).length,
  }));
  const trimmedName = participantName.trim();
  const chooseGroup = (group: StudyGroup) => setSelectedGroup(group);
  const disabledExport = completed.length === 0;
  const exportActions = [
    {
      Icon: FileSpreadsheet,
      format: "xlsx" as const,
      label: locale === "vi" ? "Xuất Excel" : "Export Excel",
    },
    {
      Icon: Download,
      format: "csv" as const,
      label: locale === "vi" ? "Xuất CSV" : "Export CSV",
    },
  ];
  const handleExportConfirm = (selectedGroups: StudyGroup[]) => {
    if (pendingExportFormat === "xlsx") {
      downloadMethodWorkbook(
        "palmpay-method-sheets.xlsx",
        completed,
        locale,
        selectedGroups,
      );
    }
    if (pendingExportFormat === "csv") {
      downloadMethodCsv("palmpay-wide.csv", completed, locale, selectedGroups);
    }
    setPendingExportFormat(null);
  };

  return (
    <main className="min-h-screen bg-[#fbf7f1] p-4 text-stone-950 sm:p-6">
      <div className="mx-auto min-h-[calc(100vh-3rem)] max-w-[1200px] rounded-lg border border-[#ead8bf] bg-white px-5 py-6 sm:px-8 lg:px-10 2xl:max-w-[1540px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <BrandLockup subtitle={locale === "vi" ? "Nghiên cứu" : "Research"} />
          <LocaleSwitcher locale={locale} onChange={onLocaleChange} />
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="relative min-h-[260px] overflow-hidden rounded-lg border border-[#ead8bf] bg-[#fffaf5]">
              <Image
                alt="Latte art coffee cup on a saucer"
                className="object-cover object-center"
                fill
                priority
                sizes="(min-width: 1280px) 1060px, 100vw"
                src="/brand/coffee-hero-banner.png"
              />
              <div className="relative z-10 flex min-h-[260px] max-w-[600px] flex-col justify-center px-6 py-7 sm:px-8">
                <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#ead8bf] bg-[#fffaf5] px-3 py-1.5 text-sm font-semibold text-[#8a5736]">
                  <Coffee size={15} aria-hidden />
                  {locale === "vi" ? "Nghiên cứu thanh toán tại quầy" : "POS payment research"}
                </div>
                <h1 className="mt-5 max-w-[580px] text-3xl font-extrabold leading-[1.08] tracking-normal text-[#21160f] sm:text-4xl">
                  {locale === "vi" ? "Thiết lập phiên nghiên cứu" : "Research session setup"}
                </h1>
                <p className="mt-4 max-w-[500px] text-sm leading-6 text-stone-600">
                  {locale === "vi"
                    ? "Tạo phiên mới và chọn phương thức thanh toán cần thử nghiệm."
                    : "Configure a new research session and choose the payment method to test."}
                </p>
              </div>
            </section>

            <section className="rounded-lg border border-[#ead8bf] bg-white px-5 py-5 sm:px-6">
              <div className="mb-5 flex items-center gap-3">
                <ClipboardCheck size={20} aria-hidden />
                <h2 className="text-lg font-semibold">
                  {locale === "vi"
                    ? "Chọn phương thức thanh toán để nghiên cứu"
                    : "Choose the payment method to research"}
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {counts.map(({ group, count }) => {
                  const copy = groupCopyFor(group, locale);
                  const Icon = copy.icon;
                  const selected = selectedGroup === group;
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        "relative flex min-h-[188px] flex-col items-center justify-center rounded-lg border p-4 text-center transition hover:border-[#8a4d2a] focus:outline-none focus:ring-2 focus:ring-[#b78352]",
                        copy.color,
                        selected && "border-[#8a4d2a] ring-1 ring-[#8a4d2a]",
                      )}
                      key={group}
                      onClick={() => chooseGroup(group)}
                      type="button"
                    >
                      {selected && (
                        <span className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#8a4d2a] text-white">
                          <Check size={18} aria-hidden />
                        </span>
                      )}
                      <Icon className="mb-4" size={32} aria-hidden />
                      <h3 className="text-base font-semibold">{copy.shortLabel}</h3>
                      <p className="mt-2 text-sm leading-5 opacity-75">{copy.device}</p>
                      <span className="mt-5 inline-flex min-w-32 items-center justify-center gap-2 rounded-full border border-current/20 bg-white/55 px-3 py-1.5 text-sm font-semibold">
                        <User size={15} aria-hidden />
                        {count} {locale === "vi" ? "bản ghi" : "records"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <form
              className="rounded-lg border border-[#ead8bf] bg-white p-5 sm:p-6"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!trimmedName || creating) return;
                setCreating(true);
                try {
                  await onCreate(trimmedName, selectedGroup);
                } finally {
                  setCreating(false);
                }
              }}
            >
              <h2 className="text-lg font-semibold">
                {locale === "vi" ? "Thông tin người tham gia" : "Participant information"}
              </h2>
              <label
                className="mt-5 block text-sm font-medium leading-5 text-stone-600"
                htmlFor="participant-name"
              >
                {t("participantName", locale)}
              </label>
              <div className="relative mt-2">
                <User
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#a67b60]"
                  size={18}
                  aria-hidden
                />
                <input
                  autoComplete="off"
                  className="h-11 w-full rounded-lg border border-[#ead8bf] bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-stone-400 focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                  id="participant-name"
                  onChange={(event) => setParticipantName(event.target.value)}
                  placeholder={t("participantPlaceholder", locale)}
                  required
                  value={participantName}
                />
              </div>
              <button
                className={cn(primaryButtonClass, "mt-6 h-12 w-full text-base")}
                disabled={!trimmedName || creating}
                type="submit"
              >
                <PlayCircle size={27} aria-hidden />
                {creating ? t("loading", locale) : t("startSession", locale)}
              </button>
            </form>

            <section className="rounded-lg border border-[#ead8bf] bg-white p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <ExternalLink size={21} aria-hidden />
                <h2 className="text-lg font-semibold">Export data</h2>
              </div>
              <div className="mt-6 grid gap-3">
                {exportActions.map(({ Icon, format, label }) => (
                  <button
                    className="inline-flex h-12 items-center gap-4 rounded-lg border border-[#ead8bf] bg-white px-4 text-left text-sm font-medium text-stone-800 transition hover:bg-[#fffaf3] disabled:text-stone-400"
                    disabled={disabledExport}
                    key={label}
                    onClick={() => setPendingExportFormat(format)}
                    type="button"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f7f1e9] text-[#6f3f24]">
                      <Icon size={21} aria-hidden />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
      {pendingExportFormat && (
        <ExportMethodDialog
          format={pendingExportFormat}
          locale={locale}
          onCancel={() => setPendingExportFormat(null)}
          onConfirm={handleExportConfirm}
          sessions={completed}
        />
      )}
    </main>
  );
}

function ExportMethodDialog({
  format,
  locale = defaultLocale,
  onCancel,
  onConfirm,
  sessions,
}: {
  format: ExportFormat;
  locale?: Locale;
  onCancel: () => void;
  onConfirm: (selectedGroups: StudyGroup[]) => void;
  sessions: ExperimentSession[];
}) {
  const [selectedGroups, setSelectedGroups] = useState<StudyGroup[]>(groupOrder);
  const allSelected = selectedGroups.length === groupOrder.length;
  const selectedCount = filterSessionsByMethods(sessions, selectedGroups).length;
  const formatLabel = format === "xlsx" ? t("methodExcel", locale) : t("dataCsv", locale);

  const toggleGroup = (group: StudyGroup) => {
    setSelectedGroups((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group],
    );
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4"
      role="dialog"
    >
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-[760px] overflow-y-auto rounded-lg border border-[#ead8bf] bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-[#8a5736]">
              {formatLabel}
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-[#17120f]">
              {t("exportMethods", locale)}
            </h2>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
            onClick={() => setSelectedGroups(groupOrder)}
            type="button"
          >
            {t("selectAll", locale)}
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {groupOrder.map((group) => {
            const copy = groupCopyFor(group, locale);
            const Icon = copy.icon;
            const selected = selectedGroups.includes(group);
            const count = sessions.filter((item) => item.assigned_group === group).length;
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "relative flex min-h-[168px] flex-col items-center justify-center rounded-lg border p-4 text-center transition hover:border-[#8a4d2a] focus:outline-none focus:ring-2 focus:ring-[#b78352]",
                  copy.color,
                  selected && "border-[#8a4d2a] ring-1 ring-[#8a4d2a]",
                )}
                key={group}
                onClick={() => toggleGroup(group)}
                type="button"
              >
                {selected && (
                  <span className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#8a4d2a] text-white">
                    <Check size={18} aria-hidden />
                  </span>
                )}
                <Icon className="mb-4" size={32} aria-hidden />
                <h3 className="text-base font-semibold">{copy.shortLabel}</h3>
                <p className="mt-2 text-sm leading-5 opacity-75">{copy.device}</p>
                <span className="mt-5 inline-flex min-w-32 items-center justify-center gap-2 rounded-full border border-current/20 bg-white/55 px-3 py-1.5 text-sm font-semibold">
                  <User size={15} aria-hidden />
                  {count} {locale === "vi" ? "bản ghi" : "records"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-stone-600">
            {allSelected
              ? locale === "vi"
                ? `Xuất tất cả ${selectedCount} bản ghi.`
                : `Exporting all ${selectedCount} records.`
              : locale === "vi"
                ? `Xuất ${selectedCount} bản ghi từ ${selectedGroups.length} phương thức.`
                : `Exporting ${selectedCount} records from ${selectedGroups.length} methods.`}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg border border-[#ead8bf] bg-white px-5 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
              onClick={onCancel}
              type="button"
            >
              {locale === "vi" ? "Hủy" : "Cancel"}
            </button>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-5 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
              disabled={selectedGroups.length === 0}
              onClick={() => onConfirm(selectedGroups)}
              type="button"
            >
              <Download size={17} aria-hidden />
              {format === "xlsx"
                ? locale === "vi" ? "Xuất Excel" : "Export Excel"
                : locale === "vi" ? "Xuất CSV" : "Export CSV"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExperimentHeader({
  locale,
  onLocaleChange,
  session,
  onReset,
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  session: ExperimentSession;
  onReset: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#ead8bf] bg-[#fffaf5]/95 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 sm:px-6 2xl:max-w-[1540px]">
        <BrandLockup
          compact
          subtitle={
            session.participant_name
              ? `${locale === "vi" ? "Nghiên cứu PalmPay Coffee" : "PalmPay Coffee Study"} - ${session.participant_name}`
              : t("appTitle", locale)
          }
        />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <LocaleSwitcher locale={locale} onChange={onLocaleChange} />
          <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-sm font-medium text-stone-700">
            <WalletCards className="text-[#9b6138]" size={16} aria-hidden />
            {t("balance", locale)}: {formatVnd(startingBalance)}
          </span>
          <button
            className={cn(secondaryButtonClass, "h-10 text-sm")}
            onClick={onReset}
            type="button"
          >
            <RotateCcw size={15} aria-hidden />
            {t("admin", locale)}
          </button>
        </div>
      </div>
    </header>
  );
}

function LocaleSwitcher({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div
      aria-label={t("language", locale)}
      className="inline-flex h-10 items-center rounded-lg border border-[#ead8bf] bg-white p-1"
      role="group"
    >
      {(["vi", "en"] as const).map((item) => (
        <button
          aria-pressed={locale === item}
          className={cn(
            "h-8 min-w-8 rounded-md px-2.5 text-xs font-semibold transition",
            locale === item
              ? "bg-[#6f3f24] text-white"
              : "text-stone-700 hover:bg-[#fffaf3]",
          )}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function ProgressRail({
  currentStep,
  group,
  locale = defaultLocale,
}: {
  currentStep: StepKey;
  group: StudyGroup | null;
  locale?: Locale;
}) {
  const activeIndex = flowSteps.indexOf(currentStep);
  const MethodIcon = group ? groupCopyFor(group, locale).icon : Nfc;
  return (
    <aside className="self-start rounded-lg border border-[#ead8bf] bg-white p-4 lg:sticky lg:top-[92px] lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
      <div className="mb-5 flex items-center gap-2">
        <ClipboardCheck size={18} aria-hidden />
        <h2 className="text-base font-bold">{t("flowTitle", locale)}</h2>
      </div>
      <div className="space-y-2.5">
        {flowSteps.map((step, index) => {
          const active = step === currentStep;
          const done = activeIndex > index;
          return (
            <div
              className={cn(
                "flex min-h-10 items-center gap-2.5 rounded-lg border px-3 text-sm transition",
                active
                  ? "border-[#d6b896] bg-[#fff5e8] font-bold text-[#6f3f24]"
                  : done
                    ? "border-[#dfe7d7] bg-[#f3f7ef] text-[#47683f]"
                    : "border-transparent bg-white text-stone-400",
              )}
              key={step}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  active
                    ? "bg-[#7b4325] text-white"
                    : done
                      ? "bg-[#47683f] text-white"
                      : "bg-[#ece8e2] text-stone-500",
                )}
              >
                {done ? <Check size={15} aria-hidden /> : index + 1}
              </span>
              <span className="min-w-0 truncate">
                {index + 1}. {stepLabel(step, locale)}
              </span>
            </div>
          );
        })}
      </div>
      {group && (
        <div className="mt-5 rounded-lg border border-[#dbe6d2] bg-[#f1f6ed] p-3 text-[#365d32]">
          <div className="flex items-center gap-3">
            <MethodIcon className="shrink-0" size={22} aria-hidden />
            <p className="text-sm font-bold">{groupCopyFor(group, locale).label}</p>
          </div>
        </div>
      )}
    </aside>
  );
}

function ConsentScreen({
  locale = defaultLocale,
  onContinue,
}: {
  locale?: Locale;
  onContinue: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const infoCards = (
    locale === "vi"
      ? [
          {
            Icon: GraduationCap,
            body: "Đây là nghiên cứu học thuật.",
            title: "Nghiên cứu học thuật",
          },
          {
            Icon: WalletCards,
            body: "Không sử dụng tiền thật hoặc tài khoản thật.",
            title: "Không sử dụng tiền thật",
          },
          {
            Icon: Hand,
            body: "Bạn có thể dừng tham gia bất kỳ lúc nào.",
            title: "Dừng bất kỳ lúc nào",
          },
          {
            Icon: LockKeyhole,
            body: "Dữ liệu chỉ được sử dụng cho mục đích nghiên cứu.",
            title: "Dữ liệu cho nghiên cứu",
          },
        ]
      : [
          {
            Icon: GraduationCap,
            body: "This is an academic study.",
            title: "Academic research",
          },
          {
            Icon: WalletCards,
            body: "No real money or real account is used.",
            title: "No real money",
          },
          {
            Icon: Hand,
            body: "You may stop participating at any time.",
            title: "Stop anytime",
          },
          {
            Icon: LockKeyhole,
            body: "Data is used only for research purposes.",
            title: "Research data only",
          },
        ]
  );
  return (
    <Panel
      eyebrow={locale === "vi" ? "Đồng ý tham gia" : "Participation consent"}
      icon={ShieldCheck}
      title={locale === "vi" ? "Thông tin nghiên cứu" : "Study information"}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {infoCards.map(({ Icon, body, title: cardTitle }) => (
          <div
            className="flex min-h-[210px] flex-col items-center justify-center rounded-lg border border-[#ead8bf] bg-[#fffaf7] p-5 text-center"
            key={cardTitle}
          >
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[#f0dfca] bg-[#f7efe5] text-[#7b4325]">
              <Icon size={38} strokeWidth={1.8} aria-hidden />
            </div>
            <h2 className="text-base font-extrabold text-[#17120f]">{cardTitle}</h2>
            <p className="mt-3 max-w-[200px] text-sm leading-6 text-stone-600">
              {body}
            </p>
          </div>
        ))}
      </div>
      <label className="mt-6 flex items-center gap-3 rounded-lg border border-transparent bg-white py-1 text-base text-stone-900">
        <input
          checked={checked}
          className="h-6 w-6 shrink-0 accent-[#6f3f24]"
          onChange={(event) => setChecked(event.target.checked)}
          type="checkbox"
        />
        <span>
          {locale === "vi"
            ? "Tôi đã đọc thông tin trên và đồng ý tiếp tục trong phiên thử nghiệm này."
            : "I have read the information above and agree to continue this test session."}
        </span>
      </label>
      <ActionRow>
        <button
          className={cn(primaryButtonClass, "h-12 min-w-[240px] text-base")}
          disabled={!checked}
          onClick={onContinue}
          type="button"
        >
          {locale === "vi" ? "Tiếp tục" : "Continue"}
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
  );
}

function SetupScreen({
  biometricConsentAt,
  faceAccountName,
  faceDescriptor,
  group,
  locale = defaultLocale,
  nfcCardRef,
  onBiometricConsent,
  onComplete,
  onFaceEnroll,
  onNfcEnroll,
  onPersonalInfoChange,
  onQrPinChange,
  participantId,
  participantName,
  personalInfo,
  qrPin,
  templateRef,
}: {
  biometricConsentAt?: string | null;
  faceAccountName: string;
  faceDescriptor?: number[] | null;
  group: StudyGroup;
  locale?: Locale;
  nfcCardRef?: string | null;
  onBiometricConsent: () => void;
  onComplete: (metadata?: Record<string, unknown>) => void;
  onFaceEnroll: (descriptor: number[], metadata: Record<string, unknown>) => void;
  onNfcEnroll: (tap: NfcTapPayload) => void;
  onPersonalInfoChange: (personalInfo: ParticipantPersonalInfo) => void;
  onQrPinChange: (pin: string) => void;
  participantId: string;
  participantName: string;
  personalInfo: ParticipantPersonalInfo;
  qrPin: string;
  templateRef?: string | null;
}) {
  const copy = groupCopyFor(group, locale);
  const Icon = copy.icon;
  const [palmEnrollState, setPalmEnrollState] = useState<{
    message: string;
    result?: PalmSdkClientResult;
    scan?: PalmSdkClientResult;
    status: "idle" | "scanning" | "success" | "error";
  }>({
    message:
      locale === "vi"
        ? "Sẵn sàng đăng ký bằng máy quét PalmPay"
        : "Ready to enroll with the PalmPay scanner",
    status: "idle",
  });
  const pinReady = /^\d{4}$/.test(qrPin);
  const personalInfoReady = Boolean(
    personalInfo.cccd.trim() &&
      personalInfo.address.trim() &&
      personalInfo.phone.trim(),
  );
  const biometricConsentReady = Boolean(biometricConsentAt);
  const faceReady = Boolean(faceDescriptor?.length);
  const methodReady =
    group === "QR_PIN"
      ? pinReady
      : group === "FACE_POS"
        ? faceReady
        : group === "PALM_VEIN"
          ? biometricConsentReady
          : Boolean(nfcCardRef);
  const setupReady = personalInfoReady && methodReady;

  const finishSetup = () => {
    if (!setupReady) return;
    if (group === "QR_PIN") {
      onComplete({ personal_info: personalInfo, qr_pin_registered: true });
      return;
    }
    if (group === "FACE_POS") {
      onComplete({
        face_registered: true,
        personal_info: personalInfo,
        template_ref: templateRef,
      });
      return;
    }
    if (group === "PALM_VEIN") {
      onComplete({
        biometric_consent_at: biometricConsentAt,
        device_name: palmEnrollState.result?.deviceName,
        feature_bytes: palmEnrollState.result?.featureBytes,
        frames_seen: palmEnrollState.result?.framesSeen,
        palm_samples_registered: true,
        personal_info: personalInfo,
        sample_count: palmEnrollState.result?.sampleCount ?? 3,
        sdk_version: palmEnrollState.result?.sdkVersion,
        template_ref: templateRef,
      });
      return;
    }
    onComplete({ card_ref: nfcCardRef, nfc_card_ready: true, personal_info: personalInfo });
  };

  const startPalmEnrollment = async () => {
    if (!templateRef || palmEnrollState.status === "scanning" || biometricConsentReady) {
      return;
    }
    setPalmEnrollState({
      message:
        locale === "vi"
          ? "Đang kết nối máy quét và ghi 3 mẫu lòng bàn tay..."
          : "Connecting to the scanner and recording 3 palm samples...",
      scan: undefined,
      status: "scanning",
    });

    try {
      const result = await runPalmSdkEventScan(
        "enroll",
        { participantId, templateRef },
        (scan) => {
          setPalmEnrollState((current) => ({
            ...current,
            message: palmSdkScanHint(scan, locale, "enroll"),
            result: scan,
            scan,
          }));
        },
      );
      if (!result?.ok) {
        if (result) result.message = palmSdkClientMessage(result, locale, "enroll");
        throw new Error(
          result?.message ||
            result?.error ||
            (locale === "vi" ? "Đăng ký palm vein chưa thành công" : "Palm vein enrollment failed"),
        );
      }
      setPalmEnrollState({
        message:
          locale === "vi"
            ? "Đã đăng ký mẫu palm vein từ máy quét"
            : "Palm vein template enrolled from the scanner",
        result,
        scan: result,
        status: "success",
      });
      onBiometricConsent();
    } catch (error) {
      setPalmEnrollState({
        message: error instanceof Error ? error.message : String(error),
        status: "error",
      });
    }
  };

  const readyLabel = setupReady
    ? locale === "vi" ? "Sẵn sàng tiếp tục" : "Ready to continue"
    : locale === "vi" ? "Cần hoàn tất đăng ký" : "Setup required";
  const detailLabel =
    group === "QR_PIN"
      ? locale === "vi" ? "Tạo mã PIN thử nghiệm" : "Create test PIN"
      : group === "NFC_CARD"
        ? locale === "vi" ? "Chuẩn bị thẻ thử nghiệm" : "Prepare test card"
        : group === "FACE_POS"
          ? locale === "vi" ? "Ghi mẫu khuôn mặt" : "Record face sample"
          : locale === "vi" ? "Đăng ký bằng máy quét" : "Enroll with scanner";

  return (
    <Panel
      eyebrow={locale === "vi" ? "Đăng ký phương thức" : "Payment method setup"}
      icon={Icon}
      title={copy.label}
    >
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <PersonalInfoSection
            locale={locale}
            onChange={onPersonalInfoChange}
            personalInfo={personalInfo}
            ready={personalInfoReady}
          />

          <section className="overflow-hidden rounded-lg border border-[#ead8bf] bg-[#fffaf7]">
          <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden border-b border-[#ead8bf] bg-[#fff3df] p-6 text-center lg:border-b-0 lg:border-r">
              <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 opacity-30" aria-hidden>
                <CoffeeLeafGraphic
                  className="h-full w-full"
                  coffeeClassName="bottom-1 left-0 h-24 w-24"
                  leavesClassName="right-0 top-0 h-28 w-28 rotate-12"
                />
              </div>
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-[#ead8bf] bg-white text-[#7b4325]">
                {group === "NFC_CARD" ? (
                  <NfcSignalMark size={58} />
                ) : (
                  <Icon size={54} strokeWidth={1.8} aria-hidden />
                )}
              </div>
              <p className="mt-5 text-sm font-semibold text-[#9a4f1f]">
                {copy.device}
              </p>
              <p className="mt-2 max-w-[180px] text-xl font-extrabold leading-7 text-[#17120f]">
                {copy.shortLabel}
              </p>
            </div>

            <div className="p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#9a4f1f]">
                    {detailLabel}
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold leading-tight text-stone-950">
                    {copy.label}
                  </h2>
                  <p className="mt-3 max-w-[720px] text-sm leading-6 text-stone-600">
                    {copy.neutralDescription}
                  </p>
                </div>
                <div
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold",
                    setupReady
                      ? "border-[#dbe6d2] bg-[#f1f6ed] text-[#365d32]"
                      : "border-[#ead8bf] bg-white text-[#7b4325]",
                  )}
                >
                  {setupReady ? (
                    <CheckCircle2 size={18} aria-hidden />
                  ) : (
                    <TimerReset size={18} aria-hidden />
                  )}
                  {readyLabel}
                </div>
              </div>

              {group === "QR_PIN" && (
                <div className="rounded-lg border border-[#ead8bf] bg-white p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-extrabold text-stone-950">
                        DemoBank QR
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {locale === "vi" ? "Người gửi" : "Sender"}:{" "}
                        <span className="font-semibold text-stone-900">{participantName}</span>
                      </p>
                    </div>
                    <label className="block w-full max-w-[280px]">
                      <span className="mb-2 block text-sm font-semibold text-stone-700">
                        {locale === "vi" ? "Mã PIN 4 số" : "4-digit PIN"}
                      </span>
                      <input
                        className="h-14 w-full rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-4 text-center text-2xl font-extrabold tracking-[0.3em] text-[#6f3f24] outline-none transition placeholder:text-[#d0b69c] focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(event) =>
                          onQrPinChange(event.target.value.replace(/\D/g, "").slice(0, 4))
                        }
                        placeholder="0000"
                        type="password"
                        value={qrPin}
                      />
                    </label>
                  </div>
                </div>
              )}

              {group === "NFC_CARD" && (
                <NfcEnrollment
                  enrolledCardRef={nfcCardRef}
                  locale={locale}
                  onEnroll={onNfcEnroll}
                  participantId={participantId}
                />
              )}

              {group === "FACE_POS" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-[#ead8bf] bg-white p-4">
                    <p className="text-sm font-semibold text-stone-500">
                      {locale === "vi" ? "Tên tài khoản" : "Account name"}
                    </p>
                    <p className="mt-1 text-lg font-extrabold text-stone-950">
                      {faceAccountName || participantName}
                    </p>
                  </div>
                  <FaceEnrollment
                    enrolled={Boolean(faceDescriptor?.length)}
                    locale={locale}
                    onEnroll={onFaceEnroll}
                  />
                </div>
              )}

              {group === "PALM_VEIN" && (
                <div className="rounded-lg border border-[#ead8bf] bg-white p-5">
                  <div className="flex items-center gap-5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#fff3df] text-[#7a4a2a]">
                      <Hand size={36} strokeWidth={1.8} aria-hidden />
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-stone-950">
                        {locale === "vi"
                          ? "Đăng ký palm vein bằng máy quét"
                          : "Enroll palm vein with scanner"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {locale === "vi"
                          ? "Đặt lòng bàn tay trên thiết bị PalmPay cho đến khi hệ thống ghi đủ 3 mẫu."
                          : "Place the palm over the PalmPay scanner until 3 samples are recorded."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <PalmScanPreview
                      active={palmEnrollState.status === "scanning"}
                      error={palmEnrollState.status === "error" ? palmEnrollState.message : ""}
                      locale={locale}
                      message={
                        biometricConsentReady && palmEnrollState.status !== "error"
                          ? locale === "vi"
                            ? "Mẫu palm vein đã sẵn sàng cho phiên này."
                            : "Palm vein template is ready for this session."
                          : palmEnrollState.message
                      }
                      phase="enroll"
                      scan={palmEnrollState.scan ?? palmEnrollState.result}
                      success={palmEnrollState.status === "success" || biometricConsentReady}
                    />
                    <button
                      className={cn(primaryButtonClass, "mt-4 h-11 w-full")}
                      disabled={
                        biometricConsentReady ||
                        !templateRef ||
                        palmEnrollState.status === "scanning"
                      }
                      onClick={startPalmEnrollment}
                      type="button"
                    >
                      {palmEnrollState.status === "scanning" ? (
                        <Loader2 className="animate-spin" size={17} />
                      ) : (
                        <ScanLine size={17} aria-hidden />
                      )}
                      {locale === "vi" ? "Đăng ký bằng máy quét" : "Enroll with scanner"}
                    </button>
                  </div>
                  <div className="hidden rounded-lg border border-[#ead8bf] bg-[#fffaf3] p-4">
                    <p
                      className={cn(
                        "text-sm font-semibold leading-6",
                        palmEnrollState.status === "error"
                          ? "text-red-700"
                          : palmEnrollState.status === "success" || biometricConsentReady
                            ? "text-[#365d32]"
                            : "text-stone-700",
                      )}
                    >
                      {biometricConsentReady && palmEnrollState.status !== "error"
                        ? locale === "vi"
                          ? "Mẫu palm vein đã sẵn sàng cho phiên này."
                          : "Palm vein template is ready for this session."
                        : palmEnrollState.message}
                    </p>
                    {palmEnrollState.result?.sdkVersion && (
                      <p className="mt-2 text-xs font-semibold text-stone-500">
                        SDK {palmEnrollState.result.sdkVersion}
                        {palmEnrollState.result.deviceName
                          ? ` - ${palmEnrollState.result.deviceName}`
                          : ""}
                      </p>
                    )}
                    <button
                      className={cn(primaryButtonClass, "mt-4 h-11 w-full")}
                      disabled={
                        biometricConsentReady ||
                        !templateRef ||
                        palmEnrollState.status === "scanning"
                      }
                      onClick={startPalmEnrollment}
                      type="button"
                    >
                      {palmEnrollState.status === "scanning" ? (
                        <Loader2 className="animate-spin" size={17} />
                      ) : (
                        <ScanLine size={17} aria-hidden />
                      )}
                      {locale === "vi" ? "Đăng ký bằng máy quét" : "Enroll with scanner"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </section>
        </div>

        <aside className="hidden self-start rounded-lg border border-[#dbe6d2] bg-[#f9fbf7] p-5 text-[#365d32] 2xl:block">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white">
              {group === "NFC_CARD" ? (
                <NfcSignalMark size={30} />
              ) : (
                <Icon size={26} aria-hidden />
              )}
            </div>
            <div>
              <p className="text-base font-extrabold text-stone-950">
                {copy.shortLabel}
              </p>
              <p className="mt-1 text-sm text-stone-600">{copy.device}</p>
            </div>
          </div>
          <div className="border-t border-[#dbe6d2] pt-4">
            <p className="text-sm font-semibold text-[#365d32]">
              {locale === "vi" ? "Hướng dẫn phiên" : "Session guidance"}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-600">{copy.instruction}</p>
          </div>
          <div className="mt-5 rounded-lg border border-[#dbe6d2] bg-white p-4">
            <p className="text-sm text-stone-500">
              {locale === "vi" ? "Trạng thái" : "Status"}
            </p>
            <p className="mt-1 flex items-center gap-2 text-base font-extrabold text-[#365d32]">
              {setupReady ? (
                <CheckCircle2 size={18} aria-hidden />
              ) : (
                <TimerReset size={18} aria-hidden />
              )}
              {readyLabel}
            </p>
          </div>
        </aside>
      </div>
      <ActionRow>
        <button
          className={cn(primaryButtonClass, "h-12 min-w-[260px] text-base")}
          disabled={!setupReady}
          onClick={finishSetup}
          type="button"
        >
          {t("completeSetup", locale)}
          <ArrowRight size={17} aria-hidden />
        </button>
      </ActionRow>
    </Panel>
  );
}

function PersonalInfoSection({
  locale = defaultLocale,
  onChange,
  personalInfo,
  ready,
}: {
  locale?: Locale;
  onChange: (personalInfo: ParticipantPersonalInfo) => void;
  personalInfo: ParticipantPersonalInfo;
  ready: boolean;
}) {
  const fields: Array<{
    autoComplete: string;
    icon: typeof IdCard;
    inputMode?: "numeric" | "tel" | "text";
    key: keyof ParticipantPersonalInfo;
    label: string;
  }> = [
    {
      autoComplete: "off",
      icon: IdCard,
      inputMode: "numeric",
      key: "cccd",
      label: locale === "vi" ? "CCCD" : "Citizen ID",
    },
    {
      autoComplete: "tel",
      icon: Phone,
      inputMode: "tel",
      key: "phone",
      label: locale === "vi" ? "SĐT" : "Phone",
    },
    {
      autoComplete: "street-address",
      icon: MapPin,
      inputMode: "text",
      key: "address",
      label: locale === "vi" ? "Địa chỉ" : "Address",
    },
  ];

  return (
    <section className="rounded-lg border border-[#ead8bf] bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#9a4f1f]">
            {locale === "vi" ? "Thông tin cá nhân" : "Personal information"}
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-stone-950">
            {locale === "vi"
              ? "Xác nhận thông tin đăng ký (Giả lập)"
              : "Confirm registration details (Simulation)"}
          </h2>
        </div>
        <span
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold",
            ready
              ? "border-[#dbe6d2] bg-[#f1f6ed] text-[#365d32]"
              : "border-[#ead8bf] bg-[#fffaf3] text-[#7b4325]",
          )}
        >
          {ready ? <CheckCircle2 size={16} aria-hidden /> : <TimerReset size={16} aria-hidden />}
          {ready
            ? locale === "vi" ? "Đã đủ thông tin" : "Details ready"
            : locale === "vi" ? "Cần đủ thông tin" : "Details required"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {fields.map(({ autoComplete, icon: FieldIcon, inputMode, key, label }) => (
          <label
            className={cn("block", key === "address" && "lg:col-span-2")}
            htmlFor={`personal-info-${key}`}
            key={key}
          >
            <span className="mb-2 block text-sm font-semibold text-stone-700">
              {label}
            </span>
            <span className="relative block">
              <FieldIcon
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#a67b60]"
                size={18}
                aria-hidden
              />
              <input
                autoComplete={autoComplete}
                className="h-12 w-full rounded-lg border border-[#ead8bf] bg-[#fffaf7] pl-11 pr-4 text-sm font-medium text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                id={`personal-info-${key}`}
                inputMode={inputMode}
                onChange={(event) =>
                  onChange({
                    ...personalInfo,
                    [key]: event.target.value,
                  })
                }
                value={personalInfo[key]}
              />
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function NfcEnrollment({
  enrolledCardRef,
  locale = defaultLocale,
  onEnroll,
  participantId,
}: {
  enrolledCardRef?: string | null;
  locale?: Locale;
  onEnroll: (tap: NfcTapPayload) => void;
  participantId: string;
}) {
  const handledRef = useRef(false);
  const lastTapKeyRef = useRef("");
  const transactionId = useMemo(
    () => `SETUP-${participantId}`,
    [participantId],
  );
  const [status, setStatus] = useState(
    enrolledCardRef
      ? locale === "vi" ? "Thẻ NFC đã được liên kết" : "NFC card has been linked"
      : locale === "vi"
        ? "Đang chuẩn bị đầu đọc NFC cho bước đăng ký"
        : "Preparing the NFC reader for enrollment",
  );
  const displayStatus = enrolledCardRef
    ? locale === "vi"
      ? `Đã liên kết thẻ ${enrolledCardRef}`
      : `Linked card ${enrolledCardRef}`
    : status;

  useEffect(() => {
    if (enrolledCardRef) {
      handledRef.current = true;
      return;
    }

    handledRef.current = false;
    let active = true;
    fetch("/api/nfc-session", {
      body: JSON.stringify({
        acceptedCardRef: defaultNfcCardRef,
        amount: 0,
        transactionId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        if (active) {
          setStatus(
            locale === "vi"
              ? "Chạm thẻ NFC vào đầu đọc để liên kết với phiên này"
              : "Tap the NFC card on the reader to link it to this session",
          );
        }
      })
      .catch(() => {
        if (active) {
          setStatus(
            locale === "vi"
              ? "Không đăng ký được phiên NFC cho bước liên kết"
              : "Could not register the NFC enrollment session",
          );
        }
      });

    return () => {
      active = false;
      fetch("/api/nfc-session", {
        body: JSON.stringify({ transactionId }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      }).catch(() => undefined);
    };
  }, [enrolledCardRef, locale, transactionId]);

  useEffect(() => {
    if (enrolledCardRef) return;
    const interval = window.setInterval(() => {
      fetch(`/api/nfc-taps?transactionId=${encodeURIComponent(transactionId)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data: { tap: NfcTapPayload | null }) => {
          if (!data.tap || handledRef.current) return;
          const tapKey = `${data.tap.cardRef}:${data.tap.createdAt}`;
          if (tapKey === lastTapKeyRef.current) return;
          lastTapKeyRef.current = tapKey;
          handledRef.current = true;
          setStatus(
            locale === "vi"
              ? `Đã nhận thẻ ${data.tap.cardRef}`
              : `Received card ${data.tap.cardRef}`,
          );
          onEnroll(data.tap);
          fetch("/api/nfc-session", {
            body: JSON.stringify({ transactionId }),
            headers: { "Content-Type": "application/json" },
            method: "DELETE",
          }).catch(() => undefined);
        })
        .catch(() =>
          setStatus(
            locale === "vi"
              ? "Không đọc được trạng thái đầu đọc NFC"
              : "Could not read NFC reader status",
          ),
        );
    }, 800);

    return () => window.clearInterval(interval);
  }, [enrolledCardRef, locale, onEnroll, transactionId]);

  const simulateTap = async () => {
    const response = await fetch("/api/nfc-taps", {
      body: JSON.stringify({ cardRef: defaultNfcCardRef, transactionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setStatus(
        locale === "vi"
          ? "Nút mô phỏng bị chặn bởi token production của bridge"
          : "Simulation button is blocked by the bridge production token",
      );
    }
  };

  return (
    <div className="rounded-lg border border-[#dbe6d2] bg-white p-5">
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-[#dbe6d2] bg-[#f4f8f1]">
          <div className="relative h-[170px] w-[170px] text-[#b9caa8]">
            <span className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-45" />
            <span className="absolute left-1/2 top-1/2 h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-65" />
            <span className="absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-85" />
            <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#dbe6d2] bg-white text-[#52693d]">
              {enrolledCardRef ? (
                <CheckCircle2 size={42} aria-hidden />
              ) : (
                <NfcSignalMark size={52} />
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-sm font-semibold text-[#52693d]">
            {locale === "vi" ? "Mẫu đăng ký NFC" : "NFC enrollment sample"}
          </p>
          <h3 className="mt-1 text-lg font-extrabold text-stone-950">
            {locale === "vi"
              ? "Chạm thẻ vào thiết bị để đăng ký"
              : "Tap the card on the device to enroll"}
          </h3>
          <p className="mt-2 max-w-[560px] text-sm leading-6 text-stone-600">
            {locale === "vi"
              ? "Người tham gia chạm thẻ NFC vào đầu đọc một lần trước khi mua hàng. Mã thẻ này sẽ được dùng lại ở bước thanh toán."
              : "The participant taps the NFC card on the reader once before shopping. This card ref will be reused during payment."}
          </p>
          <p
            className={cn(
              "mt-4 rounded-lg border px-3 py-2 text-sm font-semibold",
              enrolledCardRef
                ? "border-[#dbe6d2] bg-[#f1f6ed] text-[#365d32]"
                : "border-[#ead8bf] bg-[#fffaf3] text-[#6f3f24]",
            )}
          >
            {displayStatus}
          </p>
          <button
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#dbe6d2] bg-[#f1f6ed] px-3 text-sm font-semibold text-stone-800 transition hover:border-[#b9caa8] disabled:bg-[#e4dbc9] disabled:text-stone-500 sm:w-fit"
            disabled={Boolean(enrolledCardRef)}
            onClick={simulateTap}
            type="button"
          >
            <NfcSignalMark size={22} />
            {locale === "vi" ? "Mô phỏng chạm thẻ để đăng ký" : "Simulate enrollment tap"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SurveyScreen({
  answers,
  eyebrow,
  locale = defaultLocale,
  onAnswer,
  onSubmit,
  questions,
  title,
}: {
  answers: Record<string, string | number>;
  eyebrow: string;
  locale?: Locale;
  onAnswer: (itemId: string, value: string | number) => void;
  onSubmit: () => void;
  questions: SurveyQuestion[];
  title: string;
}) {
  const [surveyStep, setSurveyStep] = useState<"profile" | "experience">("profile");
  const isProfileStep = surveyStep === "profile";
  const isAnswered = (question: SurveyQuestion) =>
    !question.required ||
    normalizeSurveyAnswer(question, answers[question.item_id]) !== "";
  const sections = questions.reduce<
    Array<{
      construct: string;
      intro: string;
      label: string;
      questions: SurveyQuestion[];
    }>
  >((groups, question) => {
    const previous = groups.find((group) => group.construct === question.construct);
    if (previous) {
      previous.questions.push(question);
      return groups;
    }
    return [
      ...groups,
      {
        construct: question.construct,
        intro: localizeText(question.section_intro, locale),
        label: constructLabel(question, locale),
        questions: [question],
      },
    ];
  }, []);
  const profileSections = sections.filter(
    (section) => section.construct === profileSurveyConstruct,
  );
  const experienceSections = sections.filter(
    (section) => section.construct !== profileSurveyConstruct,
  );
  const activeSections = isProfileStep ? profileSections : experienceSections;
  const activeQuestions = activeSections.flatMap((section) => section.questions);
  const activeComplete = activeQuestions.every(isAnswered);
  const hasExperienceStep = experienceSections.length > 0;
  const profileComplete = profileSections
    .flatMap((section) => section.questions)
    .every(isAnswered);
  const panelEyebrow = isProfileStep
    ? eyebrow
    : t("postSurveyExperienceEyebrow", locale);
  const panelTitle = isProfileStep ? title : t("postSurveyExperienceTitle", locale);
  const profileLabel =
    profileSections[0]?.label ??
    (locale === "vi" ? "Thông tin người tham gia" : "Respondent profile");
  const experienceLabel =
    locale === "vi" ? "Đánh giá trải nghiệm" : "Experience evaluation";
  const goToSurveyStep = (step: "profile" | "experience") => {
    setSurveyStep(step);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  return (
    <Panel eyebrow={panelEyebrow} icon={ClipboardCheck} title={panelTitle}>
      {hasExperienceStep && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {[
            {
              key: "profile" as const,
              label: profileLabel,
              number: 1,
              complete: profileComplete,
            },
            {
              key: "experience" as const,
              label: experienceLabel,
              number: 2,
              complete: experienceSections
                .flatMap((section) => section.questions)
                .every(isAnswered),
            },
          ].map((step) => {
            const active = surveyStep === step.key;
            return (
              <button
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition",
                  active
                    ? "border-[#6f3f24] bg-[#fffaf3] text-stone-950"
                    : "border-[#ead8bf] bg-white text-stone-600 hover:border-[#c9955d]",
                )}
                disabled={step.key === "experience" && !profileComplete}
                key={step.key}
                onClick={() => goToSurveyStep(step.key)}
                type="button"
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
                    active ? "bg-[#6f3f24] text-white" : "bg-[#f7efe5] text-[#7a4a2a]",
                  )}
                >
                  {step.complete ? <Check size={15} aria-hidden /> : step.number}
                </span>
                <span className="min-w-0 text-sm font-semibold leading-5">
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="space-y-4">
        {activeSections.map((section) => (
          <section
            className="rounded-lg border border-[#ead8bf] bg-[#fffaf3] p-4"
            key={section.construct}
          >
            <div className="mb-4">
              <h2 className="text-center text-base font-bold text-stone-950">
                {section.label}
              </h2>
              {section.intro && (
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-600">
                  {section.intro}
                </p>
              )}
            </div>
            <div className="space-y-3">
              {section.questions.map((question) => {
                const answerValue = answers[question.item_id];
                const normalizedValue = normalizeSurveyAnswer(question, answerValue);
                const text = questionText(question, locale);
                const emphasis = questionEmphasis(question, locale);
                const options = questionOptions(question, locale);
                const useRadioChoices =
                  section.construct === profileSurveyConstruct &&
                  question.type === "select";
                return (
                  <div
                    className="rounded-lg border border-[#ead8bf] bg-white p-4"
                    key={question.item_id}
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-normal leading-6 text-stone-950">
                          {renderTextWithEmphasis(text, emphasis)}
                        </p>
                      </div>
                    </div>
                    {useRadioChoices ? (
                      <RadioChoiceGroup
                        itemId={question.item_id}
                        onChange={(value) => onAnswer(question.item_id, value)}
                        options={options}
                        value={selectAnswerValue(question, answerValue)}
                      />
                    ) : question.type === "select" ? (
                      <div className="max-w-sm">
                        <CustomSelect
                          onChange={(value) => onAnswer(question.item_id, Number(value))}
                          options={options.map((option, index) => ({
                            label: option,
                            value: String(index + 1),
                          }))}
                          placeholder={t("chooseAnswer", locale)}
                          value={selectAnswerValue(question, answerValue)}
                        />
                      </div>
                    ) : (
                      <Likert
                        locale={locale}
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
          </section>
        ))}
      </div>
      <ActionRow>
        <div className="flex w-full flex-wrap justify-between gap-3">
          {!isProfileStep ? (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-[#c9955d]"
              onClick={() => goToSurveyStep("profile")}
              type="button"
            >
              <ArrowLeft size={17} aria-hidden />
              {t("previous", locale)}
            </button>
          ) : (
            <span aria-hidden />
          )}
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
            disabled={!activeComplete}
            onClick={() => {
              if (isProfileStep && hasExperienceStep) {
                goToSurveyStep("experience");
                return;
              }
              onSubmit();
            }}
            type="button"
          >
            {isProfileStep && hasExperienceStep
              ? t("surveyContinue", locale)
              : t("complete", locale)}
            <ArrowRight size={17} aria-hidden />
          </button>
        </div>
      </ActionRow>
    </Panel>
  );
}

function RadioChoiceGroup({
  itemId,
  onChange,
  options,
  value,
}: {
  itemId: string;
  onChange: (value: number) => void;
  options: string[];
  value: string;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {options.map((option, index) => {
        const optionValue = String(index + 1);
        const optionId = `survey-${itemId}-${optionValue}`;
        const checked = value === optionValue;
        return (
          <label
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-5 transition",
              checked
                ? "border-[#6f3f24] bg-[#fffaf3] text-stone-950"
                : "border-[#ead8bf] bg-white text-stone-700 hover:border-[#c9955d]",
            )}
            htmlFor={optionId}
            key={optionValue}
          >
            <input
              checked={checked}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#6f3f24]"
              id={optionId}
              name={`survey-${itemId}`}
              onChange={() => onChange(Number(optionValue))}
              type="radio"
              value={optionValue}
            />
            <span className="min-w-0">{option}</span>
          </label>
        );
      })}
    </div>
  );
}

function Likert({
  locale = defaultLocale,
  max,
  min,
  onChange,
  value,
}: {
  locale?: Locale;
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
        <span>
          {locale === "vi" ? "Hoàn toàn không đồng ý" : "Strongly disagree"}
        </span>
        <span>{locale === "vi" ? "Hoàn toàn đồng ý" : "Strongly agree"}</span>
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

function getCameraUnavailableMessage() {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Camera chỉ hoạt động trên HTTPS hoặc localhost.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Trình duyệt này chưa hỗ trợ mở camera từ trang web.";
  }
  return null;
}

function cameraErrorMessage(error: unknown) {
  const unavailable = getCameraUnavailableMessage();
  if (unavailable) return unavailable;

  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Chrome đang chặn camera. Bấm biểu tượng ổ khóa/camera trên thanh địa chỉ và cho phép camera cho trang này.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Không tìm thấy camera phù hợp trên thiết bị này.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Camera đang bị ứng dụng khác hoặc hệ điều hành giữ quyền truy cập.";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Không mở được camera.";
}

type FaceSampleDetection = {
  detection: {
    box: {
      height: number;
      width: number;
      x: number;
      y: number;
    };
    score: number;
  };
};

const enrollmentPrompts = [
  "Mẫu 1: nhìn thẳng vào camera, giữ mặt trong khung.",
  "Mẫu 2: nghiêng mặt nhẹ sang trái hoặc phải.",
  "Mẫu 3: nhìn thẳng lại, giữ ánh sáng đều trên mặt.",
];

const enrollmentPromptsEn = [
  "Sample 1: look straight at the camera and keep your face in frame.",
  "Sample 2: turn your face slightly left or right.",
  "Sample 3: look straight again with even lighting.",
];

function enrollmentPrompt(
  sampleCount: number,
  enrolled: boolean,
  locale = defaultLocale,
) {
  if (enrolled) {
    return locale === "vi"
      ? "Đăng ký hoàn tất. Mẫu khuôn mặt đã sẵn sàng để xác nhận."
      : "Setup complete. The face sample is ready for confirmation.";
  }
  const prompts = locale === "vi" ? enrollmentPrompts : enrollmentPromptsEn;
  return prompts[Math.min(sampleCount, prompts.length - 1)];
}

function evaluateEnrollmentSample(
  detection: FaceSampleDetection,
  video: HTMLVideoElement,
) {
  const { box, score } = detection.detection;
  const frameWidth = video.videoWidth || video.clientWidth || 1;
  const frameHeight = video.videoHeight || video.clientHeight || 1;
  const faceHeightRatio = box.height / frameHeight;
  const faceCenterX = (box.x + box.width / 2) / frameWidth;
  const faceCenterY = (box.y + box.height / 2) / frameHeight;

  if (score < 0.65) {
    return "Mẫu chưa đủ rõ. Lau camera, tăng ánh sáng hoặc nhìn thẳng hơn rồi thử lại.";
  }
  if (faceHeightRatio < 0.16) {
    return "Mặt đang quá xa camera. Đưa mặt lại gần hơn rồi ghi mẫu.";
  }
  if (faceHeightRatio > 0.72) {
    return "Mặt đang quá gần camera. Lùi lại một chút rồi ghi mẫu.";
  }
  if (faceCenterX < 0.28 || faceCenterX > 0.72 || faceCenterY < 0.22 || faceCenterY > 0.78) {
    return "Đưa mặt vào giữa khung hình rồi ghi mẫu.";
  }
  return null;
}

function FaceEnrollment({
  enrolled,
  locale = defaultLocale,
  onEnroll,
}: {
  enrolled: boolean;
  locale?: Locale;
  onEnroll: (descriptor: number[], metadata: Record<string, unknown>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [api, setApi] = useState<FaceApi | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    enrolled
      ? locale === "vi"
        ? "Đăng ký hoàn tất. Mẫu khuôn mặt đã sẵn sàng."
        : "Setup complete. The face sample is ready."
      : locale === "vi"
        ? "Mở camera, rồi ghi 3 mẫu theo hướng dẫn."
        : "Open the camera, then record 3 samples using the guide.",
  );
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
    setNotice(
      locale === "vi"
        ? "Đang mở camera và tải mô hình nhận diện..."
        : "Opening camera and loading recognition models...",
    );
    try {
      const unavailable = getCameraUnavailableMessage();
      if (unavailable) throw new Error(unavailable);
      const loadedApi = api ?? (await loadFaceApiModels());
      setApi(loadedApi);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setNotice(enrollmentPrompt(sampleCount, enrolled, locale));
    } catch (cameraError) {
      setError(cameraErrorMessage(cameraError));
      setNotice(locale === "vi" ? "Chưa mở được camera." : "Could not open camera.");
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
    setNotice(
      locale === "vi"
        ? "Đang kiểm tra chất lượng mẫu..."
        : "Checking sample quality...",
    );
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
        setNotice(enrollmentPrompt(sampleCount, enrolled, locale));
        return;
      }

      const qualityError = evaluateEnrollmentSample(detection, videoRef.current);
      if (qualityError) {
        setError(qualityError);
        setNotice(enrollmentPrompt(sampleCount, enrolled, locale));
        return;
      }

      descriptorsRef.current = [...descriptorsRef.current, detection.descriptor].slice(-3);
      const nextCount = descriptorsRef.current.length;
      setSampleCount(nextCount);

      if (nextCount >= 3) {
        setNotice(
          locale === "vi"
            ? "Đăng ký hoàn tất. Mẫu khuôn mặt đã sẵn sàng."
            : "Setup complete. The face sample is ready.",
        );
        onEnroll(averageDescriptors(descriptorsRef.current), {
          face_model: "tiny_face_detector+face_landmark_68+face_recognition",
          raw_image_stored: false,
          sample_count: nextCount,
          template_encrypted_at_rest: true,
        });
      } else {
        setNotice(
          locale === "vi"
            ? `Đã ghi mẫu ${nextCount}/3. ${enrollmentPrompt(nextCount, false, locale)}`
            : `Recorded sample ${nextCount}/3. ${enrollmentPrompt(nextCount, false, locale)}`,
        );
      }
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Không thể ghi mẫu khuôn mặt.",
      );
      setNotice(enrollmentPrompt(sampleCount, enrolled, locale));
    } finally {
      setBusy(false);
    }
  };

  const enrollmentComplete = enrolled || sampleCount >= 3;

  return (
    <div className="rounded-lg border border-[#ead8bf] bg-white p-4">
      <ol className="mb-3 grid gap-2 text-sm text-stone-600 md:grid-cols-3">
        {(locale === "vi"
          ? [
              "Nhìn thẳng, mặt ở giữa khung",
              "Nghiêng nhẹ trái hoặc phải",
              "Nhìn thẳng lại, ánh sáng đều",
            ]
          : [
              "Look straight, face centered",
              "Turn slightly left or right",
              "Look straight again, even lighting",
            ]
        ).map((instruction, index) => {
          const done = sampleCount > index;
          const active = sampleCount === index && !enrollmentComplete;
          return (
            <li
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-md px-2",
                active && "bg-[#fffaf3] text-[#6f3f24]",
                done && "text-emerald-700",
              )}
              key={instruction}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : active
                      ? "border-[#d5aa84] bg-[#fffaf3] text-[#6f3f24]"
                      : "border-[#ead8bf] text-stone-500",
                )}
              >
                {done ? <Check size={14} aria-hidden /> : index + 1}
              </span>
              <span>{instruction}</span>
            </li>
          );
        })}
      </ol>
      <div className="relative aspect-video overflow-hidden rounded-lg border border-[#ead8bf] bg-stone-900">
        <video
          autoPlay
          className="h-full w-full object-cover"
          muted
          playsInline
          ref={videoRef}
        />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/80">
            {locale === "vi" ? "Camera đăng ký" : "Registration camera"}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          {locale === "vi" ? "Mẫu đã ghi" : "Samples recorded"}:{" "}
          <span className="font-semibold">{sampleCount}/3</span>
        </p>
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((index) => (
            <span
              aria-label={
                locale === "vi"
                  ? `Mẫu ${index + 1}${sampleCount > index ? " đã ghi" : " chưa ghi"}`
                  : `Sample ${index + 1}${sampleCount > index ? " recorded" : " not recorded"}`
              }
              className={cn(
                "h-2.5 w-9 rounded-full",
                sampleCount > index ? "bg-emerald-500" : "bg-[#ead8bf]",
              )}
              key={index}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3] disabled:text-[#b8a491]"
            disabled={busy || enrollmentComplete}
            onClick={startCamera}
            type="button"
          >
            <Camera size={16} aria-hidden />
            {locale === "vi" ? "Mở camera" : "Open camera"}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-3 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
            disabled={busy || !cameraActive || enrollmentComplete}
            onClick={captureFace}
            type="button"
          >
            {busy ? <Loader2 className="animate-spin" size={16} /> : <ScanFace size={16} />}
            {sampleCount === 0
              ? locale === "vi" ? "Ghi mẫu" : "Record sample"
              : locale === "vi" ? "Ghi mẫu tiếp" : "Record next sample"}
          </button>
        </div>
      </div>
      <p
        className={cn(
          "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
          enrollmentComplete
            ? "bg-emerald-50 text-emerald-700"
            : "bg-[#fffaf3] text-[#6f3f24]",
        )}
      >
        {enrollmentComplete ? (
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} aria-hidden />
        ) : (
          <ScanFace className="mt-0.5 shrink-0" size={16} aria-hidden />
        )}
        <span>{notice}</span>
      </p>
      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

function ProductScreen({
  cart,
  cartLines,
  locale = defaultLocale,
  onAdd,
  onContinue,
  onRemove,
  totalCents,
}: {
  cart: Cart;
  cartLines: CartLine[];
  locale?: Locale;
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
          [
            productName(item, locale),
            productDetail(item, locale),
            categoryLabel(item.category, locale),
            ...productTags(item, locale),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);
        return matchesCategory && matchesQuery;
      }),
    [category, locale, normalizedQuery],
  );
  const remaining = startingBalance - totalCents;
  const canContinue = cartLines.length > 0 && remaining >= 0;

  return (
    <Panel
      eyebrow={locale === "vi" ? "Mua hàng" : "Shopping"}
      icon={ShoppingBag}
      title={locale === "vi" ? "Chọn món tại quầy cafe" : "Choose cafe items"}
    >
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-5 flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <label className="relative block w-full max-w-[430px]">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                size={18}
                aria-hidden
              />
              <input
                className="h-10 w-full rounded-lg border border-[#dcc6aa] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-[#9a6237] focus:ring-2 focus:ring-[#ead3b7]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={locale === "vi" ? "Tìm latte, croissant..." : "Search latte, croissant..."}
                value={query}
              />
            </label>
            <div className="flex flex-wrap gap-2.5">
              {categoryOptions.map((item) => (
                <button
                  className={cn(
                    "h-10 rounded-lg border px-4 text-sm font-semibold transition",
                    category === item
                      ? "border-[#6f3f24] bg-[#6f3f24] text-white"
                      : "border-[#dcc6aa] bg-white text-stone-700 hover:border-[#c9955d]",
                  )}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {categoryLabel(item, locale)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleProducts.map((item) => (
              <ProductCard
                key={item.id}
                onAdd={() => onAdd(item.id)}
                onRemove={() => onRemove(item.id)}
                product={item}
                locale={locale}
                quantity={cart[item.id] ?? 0}
              />
            ))}
          </div>
        </div>

        <aside className="h-fit overflow-hidden rounded-lg border border-[#dcc6aa] bg-white p-5 2xl:sticky 2xl:top-28">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold text-stone-950">{t("cart", locale)}</h3>
            <CoffeeLeafGraphic
              className="h-12 w-16 shrink-0"
              coffeeClassName="bottom-0 left-0 h-10 w-10"
              leavesClassName="-right-1 -top-2 h-12 w-12 rotate-12"
            />
          </div>

          {cartLines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#dcc6aa] bg-[#fffaf7] px-4 py-6 text-center">
              <CoffeeLeafGraphic
                className="mx-auto h-28 w-36"
                coffeeClassName="bottom-0 left-2 h-24 w-24"
                leavesClassName="-right-1 top-0 h-24 w-24 rotate-6"
              />
              <p className="mt-4 font-bold text-stone-950">
                {locale === "vi" ? "Chưa có món nào" : "No items yet"}
              </p>
              <p className="mt-2 text-sm text-stone-500">
                {locale === "vi" ? "Hãy chọn món từ menu" : "Choose items from the menu"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartLines.map((line) => {
                const item = getProduct(line.productId);
                if (!item) return null;
                return (
                  <div
                    className="rounded-lg border border-[#ead8bf] bg-[#fffaf7] px-4 py-3"
                    key={line.productId}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-950">
                          {productName(item, locale)}
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

          <div className="mt-5 grid gap-2 text-sm">
            <Row label={locale === "vi" ? "Số dư ban đầu" : "Starting balance"} value={formatVnd(startingBalance)} />
            <Row label={locale === "vi" ? "Tổng tiền" : "Total"} value={formatVnd(totalCents)} strong />
            <Row
              label={locale === "vi" ? "Số dư sau thanh toán" : "Balance after payment"}
              value={formatVnd(Math.max(remaining, 0))}
            />
          </div>
          {remaining < 0 && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {locale === "vi"
                ? "Tổng tiền vượt quá số dư thử nghiệm."
                : "The total exceeds the test balance."}
            </p>
          )}
          <div className="mt-5 border-t border-[#ead8bf] pt-5">
            <button
              className={cn(primaryButtonClass, "h-12 w-full text-sm")}
              disabled={!canContinue}
              onClick={onContinue}
              type="button"
            >
              {t("confirmCart", locale)}
              <ArrowRight size={17} aria-hidden />
            </button>
          </div>
        </aside>
      </div>
    </Panel>
  );
}

function ProductCard({
  locale = defaultLocale,
  onAdd,
  onRemove,
  product,
  quantity,
}: {
  locale?: Locale;
  onAdd: () => void;
  onRemove: () => void;
  product: Product;
  quantity: number;
}) {
  const selected = quantity > 0;
  const name = productName(product, locale);
  const detail = productDetail(product, locale);
  const category = categoryLabel(product.category, locale);
  const selectProduct = () => {
    if (!selected) onAdd();
  };

  return (
    <article
      aria-label={`${selected ? t("selected", locale) : locale === "vi" ? "Chọn" : "Choose"} ${name}`}
      aria-pressed={selected}
      className={cn(
        "group flex h-full min-h-[290px] flex-col overflow-hidden rounded-lg border bg-white text-left outline-none transition focus:ring-2 focus:ring-[#9a6237]",
        selected
          ? "border-[#9a6237] bg-[#fffaf3] ring-2 ring-[#c9955d]/25"
          : "cursor-pointer border-[#ead8bf] hover:border-[#c9955d]",
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
      <div className="relative aspect-[1.75] bg-[#efe1cf]">
        <Image
          alt={productImageAlt(product)}
          className="object-cover"
          fill
          sizes="(min-width: 1024px) 340px, (min-width: 768px) 45vw, 92vw"
          src={product.image}
        />
        {product.popular && (
          <span className="absolute left-3 top-3 rounded-md border border-[#ead8bf] bg-[#fffaf3]/95 px-2 py-1 text-xs font-semibold text-[#6f3f24]">
            {locale === "vi" ? "Phổ biến" : "Popular"}
          </span>
        )}
        {selected && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-[#6f3f24] px-2 py-1 text-xs font-semibold text-white">
            <CheckCircle2 size={14} aria-hidden />
            {t("selected", locale)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex min-h-[82px] items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="sr-only">{category}</p>
            <h3 className="text-base font-extrabold leading-5 text-stone-950">
              {name}
            </h3>
            <p className="mt-1.5 min-h-[36px] text-sm leading-5 text-stone-600">
              {detail}
            </p>
          </div>
          <p className="shrink-0 text-sm font-extrabold text-stone-900">
            {formatVnd(product.priceCents)}
          </p>
        </div>
        <div
          className={cn(
            "mt-auto ml-auto flex h-9 w-[136px] items-center justify-between rounded-lg border px-1.5 transition",
            selected
              ? "border-[#9a6237] bg-[#efe1cf]"
              : "border-[#dcc6aa] bg-[#fffaf3]",
          )}
        >
          <button
            aria-label={`${locale === "vi" ? "Giảm" : "Decrease"} ${name}`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-700 transition hover:bg-white disabled:text-[#b8a491]"
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
            aria-label={`${locale === "vi" ? "Thêm" : "Add"} ${name}`}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#6f3f24] text-white transition hover:bg-[#5a341f]"
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
  locale = defaultLocale,
  onPay,
  totalCents,
}: {
  cartLines: CartLine[];
  group: StudyGroup;
  locale?: Locale;
  onPay: () => void;
  totalCents: number;
}) {
  const copy = groupCopyFor(group, locale);
  const Icon = copy.icon;
  const canPay = cartLines.length > 0 && totalCents <= startingBalance;
  return (
    <Panel eyebrow={t("checkout", locale)} icon={ShoppingCart} title={t("cart", locale)}>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="relative overflow-hidden rounded-lg border border-[#ead8bf] bg-[#fffaf7] p-4">
            <div className="pointer-events-none absolute -right-7 -top-8 h-28 w-32 opacity-30" aria-hidden>
              <CoffeeLeafGraphic
                className="h-full w-full"
                coffeeClassName="bottom-0 left-1 h-20 w-20"
                leavesClassName="-right-1 top-0 h-24 w-24 rotate-12"
              />
            </div>
            <div className="relative z-10 space-y-3">
              {cartLines.map((line) => {
                const item = getProduct(line.productId);
                if (!item) return null;
                return (
                  <div
                    className="flex items-center justify-between gap-4 rounded-lg border border-[#ead8bf] bg-white p-4"
                    key={line.productId}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="relative h-18 w-18 shrink-0 overflow-hidden rounded-lg border border-[#ead8bf] bg-[#f7efe5]">
                        <Image
                          alt=""
                          aria-hidden
                          className="object-cover"
                          fill
                          sizes="96px"
                          src={item.image}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-extrabold text-stone-950">
                          {productName(item, locale)}
                        </p>
                        <p className="mt-2 text-base text-stone-500">
                          {line.quantity} x {formatVnd(item.priceCents)}
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 text-lg font-extrabold text-stone-950">
                      {formatVnd(lineTotal(line))}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-5 grid gap-2 text-sm">
            <Row label={locale === "vi" ? "Số lượng món" : "Item count"} value={String(cartCount(cartLines))} />
            <Row label={locale === "vi" ? "Số dư ban đầu" : "Starting balance"} value={formatVnd(startingBalance)} />
            <Row label={locale === "vi" ? "Tổng tiền" : "Total"} value={formatVnd(totalCents)} strong />
          </div>
          <div className="mt-5 flex items-center justify-between rounded-lg border border-[#dbe6d2] bg-[#f4f8f1] px-5 py-4 text-[#365d32]">
            <span className="text-base font-extrabold">
              {locale === "vi" ? "Số dư sau thanh toán" : "Balance after payment"}
            </span>
            <span className="text-lg font-extrabold">
              {formatVnd(startingBalance - totalCents)}
            </span>
          </div>
        </div>
        <div>
          <div className="rounded-lg border border-[#dbe6d2] bg-[#f9fbf7] p-6 text-center text-[#365d32]">
            <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-full bg-white">
              {group === "NFC_CARD" ? (
                <NfcSignalMark className="text-[#365d32]" size={44} />
              ) : (
                <Icon size={38} aria-hidden />
              )}
            </div>
            <p className="mt-6 text-sm text-stone-600">
              {locale === "vi" ? "Thanh toán bằng" : "Pay with"}
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-stone-950">
              {copy.label}
            </h2>
            <p className="mx-auto mt-4 max-w-[240px] text-sm leading-6">
              {locale === "vi"
                ? "POS sẽ chuyển thẳng sang phương thức đã chọn cho phiên này."
                : "The POS will go directly to the assigned method for this session."}
            </p>
            <div className="mt-7 grid grid-cols-2 border-t border-[#dbe6d2] pt-5 text-sm text-stone-700">
              <span className="inline-flex items-center justify-center gap-2 border-r border-[#dbe6d2]">
                <ShieldCheck size={18} aria-hidden />
                {locale === "vi" ? "An toàn" : "Secure"}
              </span>
              <span className="inline-flex items-center justify-center gap-2">
                <Zap size={18} aria-hidden />
                {locale === "vi" ? "Nhanh chóng" : "Fast"}
              </span>
            </div>
          </div>
          <button
            className={cn(primaryButtonClass, "mt-5 h-12 w-full text-base")}
            disabled={!canPay}
            onClick={onPay}
            type="button"
          >
            {t("payment", locale)}
            <ArrowRight size={18} aria-hidden />
          </button>
        </div>
      </div>
    </Panel>
  );
}

function PaymentScreen({
  accountName,
  faceAccountName,
  faceDescriptor,
  group,
  items,
  locale = defaultLocale,
  onComplete,
  onFailure,
  onLog,
  onRetry,
  nfcCardRef,
  pin,
  productSummary,
  retries,
  senderName,
  participantId,
  templateRef,
  totalCents,
  transactionId,
}: {
  accountName: string;
  faceAccountName: string;
  faceDescriptor?: number[] | null;
  group: StudyGroup;
  items: CartLine[];
  locale?: Locale;
  onComplete: (metadata?: Record<string, unknown>) => void;
  onFailure: () => void;
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
  onRetry: (errorCode: string) => void;
  nfcCardRef?: string | null;
  pin: string;
  productSummary: string;
  retries: number;
  senderName: string;
  participantId: string;
  templateRef?: string | null;
  totalCents: number;
  transactionId: string;
}) {
  const [busy, setBusy] = useState(false);

  const finish = useCallback((metadata: Record<string, unknown>) => {
    setBusy(true);
    window.setTimeout(() => onComplete(metadata), 600);
  }, [onComplete]);

  return (
    <Panel
      eyebrow={locale === "vi" ? "Thanh toán tại POS" : "POS payment"}
      icon={groupCopy[group].icon}
      title={groupCopyFor(group, locale).label}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_310px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {group === "QR_PIN" && (
            <QrPosPayment
              amount={totalCents}
              authMethod="pin"
              items={items}
              locale={locale}
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
              acceptedCardRef={nfcCardRef ?? defaultNfcCardRef}
              busy={busy}
              locale={locale}
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
              locale={locale}
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
            <PalmVeinPayment
              amount={totalCents}
              busy={busy}
              locale={locale}
              onComplete={(metadata) =>
                finish({
                  channel: "palm_vein",
                  ...metadata,
                })
              }
              onLog={onLog}
              onRetry={onRetry}
              participantId={participantId}
              templateRef={templateRef}
              transactionId={transactionId}
            />
          )}
        </div>

        <RetryPanel
          group={group}
          locale={locale}
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
  locale = defaultLocale,
  onComplete,
  onLog,
  productSummary,
  senderName,
}: {
  amount: number;
  busy: boolean;
  faceDescriptor?: number[] | null;
  locale?: Locale;
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
      const unavailable = getCameraUnavailableMessage();
      if (unavailable) throw new Error(unavailable);
      const loadedApi = api ?? (await loadFaceApiModels());
      setApi(loadedApi);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setMessage("Camera POS đã sẵn sàng");
      onLog("face_pos_camera_opened", "payment", {});
    } catch (cameraError) {
      setMessage("Không mở được camera POS");
      setError(cameraErrorMessage(cameraError));
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
        <video
          autoPlay
          className="h-full w-full object-cover"
          muted
          playsInline
          ref={videoRef}
        />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/80">
            Camera Face ID tại POS
          </div>
        )}
      </div>
      <div className="rounded-lg border border-[#ead8bf] bg-white p-4 text-sm">
        <Row label={locale === "vi" ? "Người gửi" : "Sender"} value={senderName} />
        <Row label={locale === "vi" ? "Người nhận" : "Receiver"} value="Palm Pay" />
        <Row label={locale === "vi" ? "Sản phẩm" : "Products"} value={productSummary} />
        <Row label={locale === "vi" ? "Số tiền" : "Amount"} value={formatVnd(amount)} strong />
        <Row label={locale === "vi" ? "Xác thực" : "Authentication"} value="Face ID at POS" />
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
          {locale === "vi" ? "Mở camera POS" : "Open POS camera"}
        </button>
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
          disabled={busy || localBusy || !faceDescriptor?.length}
          onClick={confirmFace}
          type="button"
        >
          {localBusy ? <Loader2 className="animate-spin" size={17} /> : <ScanFace size={17} />}
          {locale === "vi" ? "Xác nhận Face ID" : "Confirm Face ID"}
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
  locale = defaultLocale,
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
  locale?: Locale;
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
        <Row label={locale === "vi" ? "Người gửi" : "Sender"} value={senderName} />
        <Row label={locale === "vi" ? "Người nhận" : "Receiver"} value="Palm Pay" />
        <Row label={locale === "vi" ? "Sản phẩm" : "Products"} value={productSummary} />
        <Row label={locale === "vi" ? "Số tiền" : "Amount"} value={formatVnd(amount)} strong />
        <Row
          label={locale === "vi" ? "Xác thực" : "Authentication"}
          value={authMethod === "face" ? "Face ID" : "PIN DemoBank"}
        />
      </div>
      <div className="rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-3 py-2 text-sm text-stone-600">
        {locale === "vi" ? "Trạng thái" : "Status"}:{" "}
        <span className="font-semibold text-[#6f3f24]">
          {transfer?.status === "paid"
            ? locale === "vi" ? "Điện thoại đã xác nhận thanh toán" : "Phone confirmed payment"
            : authMethod === "face"
              ? locale === "vi" ? "Đang chờ điện thoại quét QR và xác minh khuôn mặt" : "Waiting for phone QR scan and face verification"
              : locale === "vi" ? "Đang chờ điện thoại quét QR" : "Waiting for phone QR scan"}
        </span>
      </div>
      {paymentUrl && (
        <a
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-3 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
          href={paymentUrl}
          rel="noreferrer"
          target="_blank"
        >
          {locale === "vi" ? "Mở mô phỏng điện thoại trên máy này" : "Open phone simulation on this device"}
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
  acceptedCardRef,
  amount,
  busy,
  locale = defaultLocale,
  onComplete,
  onLog,
  onRetry,
  transactionId,
}: {
  acceptedCardRef: string;
  amount: number;
  busy: boolean;
  locale?: Locale;
  onComplete: (tap: NfcTapPayload) => void;
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
  onRetry: (errorCode: string) => void;
  transactionId: string;
}) {
  const handledRef = useRef(false);
  const lastTapKeyRef = useRef("");
  const [status, setStatus] = useState(
    locale === "vi"
      ? "Đang đăng ký giao dịch với trình kết nối đầu đọc NFC"
      : "Registering transaction with the NFC reader connector",
  );

  useEffect(() => {
    if (!transactionId) return;
    let active = true;

    fetch("/api/nfc-session", {
      body: JSON.stringify({
        acceptedCardRef,
        amount,
        transactionId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        if (active) {
          setStatus(
            locale === "vi"
              ? "Đang chờ thao tác chạm từ đầu đọc NFC"
              : "Waiting for a tap from the NFC reader",
          );
        }
      })
      .catch(() => {
        if (active) {
          setStatus(
            locale === "vi"
              ? "Không đăng ký được phiên NFC đang chờ"
              : "Could not register the pending NFC session",
          );
        }
      });

    return () => {
      active = false;
      fetch("/api/nfc-session", {
        body: JSON.stringify({ transactionId }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      }).catch(() => undefined);
    };
  }, [acceptedCardRef, amount, locale, transactionId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetch(`/api/nfc-taps?transactionId=${encodeURIComponent(transactionId)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data: { tap: NfcTapPayload | null }) => {
          if (!data.tap || handledRef.current) return;
          const tapKey = `${data.tap.cardRef}:${data.tap.createdAt}`;
          if (tapKey === lastTapKeyRef.current) return;
          lastTapKeyRef.current = tapKey;
          if (data.tap.cardRef !== acceptedCardRef) {
            setStatus(
              locale === "vi"
                ? `Thẻ không khớp: ${data.tap.cardRef}`
                : `Card does not match: ${data.tap.cardRef}`,
            );
            onRetry("wrong_card");
            return;
          }
          handledRef.current = true;
          setStatus(locale === "vi" ? "Đã nhận tap NFC" : "NFC tap received");
          onLog("nfc_tapped", "payment", { card_ref: data.tap.cardRef });
          onComplete(data.tap);
        })
        .catch(() =>
          setStatus(
            locale === "vi"
              ? "Không đọc được trạng thái trình kết nối NFC"
              : "Could not read NFC connector status",
          ),
        );
    }, 800);

    return () => window.clearInterval(interval);
  }, [acceptedCardRef, locale, onComplete, onLog, onRetry, transactionId]);

  const simulateTap = async () => {
    const response = await fetch("/api/nfc-taps", {
      body: JSON.stringify({ cardRef: acceptedCardRef, transactionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setStatus(
        locale === "vi"
          ? "Nút mô phỏng bị chặn bởi token production của bridge"
          : "Simulation button is blocked by the bridge production token",
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative flex min-h-[380px] items-center justify-center overflow-hidden rounded-lg border border-[#ead8bf] bg-[#fff8ed] px-5 py-7">
        <div className="relative z-10 flex w-full max-w-[460px] flex-col items-center text-center">
          <div className="relative h-[220px] w-[220px] text-[#ead8bf] sm:h-[240px] sm:w-[240px]">
            <span className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-45" />
            <span className="absolute left-1/2 top-1/2 h-[76%] w-[76%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-60" />
            <span className="absolute left-1/2 top-1/2 h-[52%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-current opacity-75" />
            <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#ead8bf] bg-white text-[#52693d] sm:h-24 sm:w-24">
              <NfcSignalMark size={54} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-stone-950">
            {locale === "vi" ? "Chạm thẻ vào đầu đọc" : "Tap card on the reader"}
          </p>
          <p className="mt-3 text-xl font-medium text-stone-600">
            {formatVnd(amount)}
          </p>
          <p className="mx-auto mt-5 max-w-[360px] rounded-lg border border-[#ead8bf] bg-white px-3 py-2 text-sm font-semibold text-[#6f3f24]">
            {status}
          </p>
          <div className="mx-auto mt-6 max-w-[360px] border-t border-[#ead8bf] pt-4">
            <p className="inline-flex items-center gap-2 text-base text-stone-600">
              <ShieldCheck size={20} aria-hidden />
              {locale === "vi" ? "Giao dịch an toàn và được mã hóa" : "Secure encrypted transaction"}
            </p>
          </div>
        </div>
      </div>
      <button
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#dbe6d2] bg-[#f1f6ed] px-3 text-base font-semibold text-stone-800 transition hover:border-[#b9caa8] disabled:bg-[#d6c0aa]"
        disabled={busy}
        onClick={simulateTap}
        type="button"
      >
        <NfcSignalMark size={24} />
        {locale === "vi" ? "Mô phỏng chạm thẻ" : "Simulate card tap"}
      </button>
    </div>
  );
}

function PalmScanPreview({
  active,
  amount,
  error,
  locale = defaultLocale,
  message,
  phase,
  scan,
  success,
}: {
  active: boolean;
  amount?: number;
  error?: string;
  locale?: Locale;
  message: string;
  phase: "enroll" | "verify";
  scan?: PalmSdkClientResult | null;
  success?: boolean;
}) {
  const hasPalm = Boolean(scan?.palmStatus || scan?.palmBox?.status);
  const sampleGoal = scan?.sampleGoal ?? (phase === "enroll" ? 3 : undefined);
  const sampleCount = Math.min(scan?.sampleCount ?? 0, sampleGoal ?? 0);
  const progress = sampleGoal ? Math.max(0, Math.min(100, (sampleCount / sampleGoal) * 100)) : 0;
  const box = scan?.palmBox;
  const imageWidth = scan?.imageWidth || 1;
  const imageHeight = scan?.imageHeight || 1;
  const showBox = Boolean(
    box &&
      box.status &&
      box.width > 0 &&
      box.height > 0 &&
      scan?.previewImage,
  );

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-[#ead8bf] bg-stone-950">
        <div className="relative aspect-video">
          {scan?.previewImage ? (
            <Image
              alt={locale === "vi" ? "Ảnh quét lòng bàn tay" : "Palm scan preview"}
              className="object-contain"
              fill
              sizes="(min-width: 1024px) 640px, 92vw"
              src={scan.previewImage}
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#241910] text-[#f6e8d6]">
              <div className="text-center">
                {active ? (
                  <Loader2 className="mx-auto mb-3 animate-spin" size={42} aria-hidden />
                ) : (
                  <Hand className="mx-auto mb-3" size={52} aria-hidden />
                )}
                <p className="text-sm font-semibold">
                  {locale === "vi" ? "Đang chờ hình từ máy quét" : "Waiting for scanner preview"}
                </p>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-[12%] rounded-[18px] border-2 border-dashed border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
          <div className="pointer-events-none absolute left-1/2 top-[12%] h-[76%] w-px -translate-x-1/2 bg-white/20" />
          <div className="pointer-events-none absolute left-[12%] top-1/2 h-px w-[76%] -translate-y-1/2 bg-white/20" />

          {showBox && box && (
            <div
              className="pointer-events-none absolute rounded-md border-2 border-emerald-300 bg-emerald-300/10 shadow-[0_0_18px_rgba(110,231,183,0.45)]"
              style={{
                height: `${(box.height / imageHeight) * 100}%`,
                left: `${(box.x / imageWidth) * 100}%`,
                top: `${(box.y / imageHeight) * 100}%`,
                width: `${(box.width / imageWidth) * 100}%`,
              }}
            />
          )}

          <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">
            {success ? (
              <CheckCircle2 size={15} aria-hidden />
            ) : active ? (
              <Loader2 className="animate-spin" size={15} aria-hidden />
            ) : error ? (
              <AlertTriangle size={15} aria-hidden />
            ) : (
              <Hand size={15} aria-hidden />
            )}
            {hasPalm
              ? locale === "vi" ? "Đã thấy tay" : "Palm detected"
              : active
                ? locale === "vi" ? "Đang canh tay" : "Aligning palm"
                : locale === "vi" ? "Sẵn sàng" : "Ready"}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            className={cn(
              "text-sm font-semibold leading-6",
              error
                ? "text-red-700"
                : success
                  ? "text-[#365d32]"
                  : "text-stone-700",
            )}
          >
            {message}
          </p>
          {amount ? (
            <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-[#6f3f24]">
              {formatVnd(amount)}
            </span>
          ) : null}
        </div>

        {sampleGoal ? (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-[#ead8bf]">
              <div
                className="h-full rounded-full bg-[#6f3f24] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex gap-1.5">
              {Array.from({ length: sampleGoal }).map((_, index) => (
                <span
                  className={cn(
                    "h-2.5 flex-1 rounded-full",
                    index < sampleCount ? "bg-[#6f3f24]" : "bg-[#ead8bf]",
                  )}
                  key={index}
                />
              ))}
            </div>
          </div>
        ) : null}

        {scan?.sdkVersion ? (
          <p className="mt-2 text-xs font-semibold text-stone-500">
            SDK {scan.sdkVersion}
            {scan.deviceName ? ` - ${scan.deviceName}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PalmVeinPayment({
  amount,
  busy,
  locale = defaultLocale,
  onComplete,
  onLog,
  onRetry,
  participantId,
  templateRef,
  transactionId,
}: {
  amount: number;
  busy: boolean;
  locale?: Locale;
  onComplete: (metadata: Record<string, unknown>) => void;
  onLog: (eventName: string, screenName: StepKey, metadata?: Record<string, unknown>) => void;
  onRetry: (errorCode: string) => void;
  participantId: string;
  templateRef?: string | null;
  transactionId: string;
}) {
  const [localBusy, setLocalBusy] = useState(false);
  const [status, setStatus] = useState(
    locale === "vi"
      ? "Đặt lòng bàn tay lên máy quét PalmPay để xác minh"
      : "Place your palm on the PalmPay scanner to verify",
  );
  const [error, setError] = useState("");
  const [scan, setScan] = useState<PalmSdkClientResult | null>(null);
  const disabled = busy || localBusy || !templateRef;

  const verifyPalm = async () => {
    if (disabled) return;
    setLocalBusy(true);
    setError("");
    setScan(null);
    setStatus(
      locale === "vi"
        ? "Đang kết nối máy quét và đối chiếu palm vein..."
        : "Connecting to scanner and matching palm vein...",
    );
    onLog("palm_scan_started", "payment", { template_ref: templateRef });

    try {
      const result = await runPalmSdkEventScan(
        "verify",
        { participantId, templateRef, transactionId },
        (scanEvent) => {
          setScan(scanEvent);
          setStatus(palmSdkScanHint(scanEvent, locale, "verify"));
        },
      );
      if (!result?.ok) {
        if (result) result.message = palmSdkClientMessage(result, locale, "verify");
        const code =
          result?.error === "template_not_found"
            ? "palm_no_match"
            : result?.error === "sdk_timeout"
              ? "scanner_disconnected"
              : "palm_no_match";
        onRetry(code);
        throw new Error(
          result?.message ||
            result?.error ||
            (locale === "vi" ? "Palm vein không khớp" : "Palm vein did not match"),
        );
      }

      const metadata = {
        device_name: result.deviceName,
        distance: result.distance,
        frames_seen: result.framesSeen,
        sdk_version: result.sdkVersion,
        template_ref: result.templateRef,
        threshold: result.threshold,
      };
      setScan(result);
      setStatus(locale === "vi" ? "Đã xác minh palm vein" : "Palm vein verified");
      onLog("palm_match_success", "payment", metadata);
      onComplete(metadata);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
      setStatus(
        locale === "vi"
          ? "Chưa xác minh được. Có thể thử lại."
          : "Not verified yet. You can try again.",
      );
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PalmScanPreview
        active={localBusy}
        amount={amount}
        error={error}
        locale={locale}
        message={
          templateRef
            ? status
            : locale === "vi"
              ? "Chưa có mẫu palm vein cho phiên này"
              : "No palm vein template is available for this session"
        }
        phase="verify"
        scan={scan}
        success={Boolean(scan?.ok)}
      />
      <div className="hidden min-h-64 items-center justify-center rounded-lg border border-[#ead8bf] bg-[#fffaf3] px-5 py-7">
        <div className="text-center">
          <Hand className="mx-auto mb-4 text-[#7a4a2a]" size={60} aria-hidden />
          <p className="text-lg font-semibold">
            {locale === "vi" ? "Vui lòng đặt lòng bàn tay" : "Place your palm"}
          </p>
          <p className="mt-1 text-sm text-stone-500">{formatVnd(amount)}</p>
          <p className="mx-auto mt-4 max-w-[360px] rounded-lg border border-[#ead8bf] bg-white px-3 py-2 text-sm font-semibold text-[#6f3f24]">
            {templateRef
              ? status
              : locale === "vi"
                ? "Chưa có mẫu palm vein cho phiên này"
                : "No palm vein template is available for this session"}
          </p>
          {error && (
            <p className="mx-auto mt-3 max-w-[360px] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f] disabled:bg-[#d6c0aa]"
        disabled={disabled}
        onClick={verifyPalm}
        type="button"
      >
        {localBusy ? <Loader2 className="animate-spin" size={17} /> : <ScanLine size={17} aria-hidden />}
        {locale === "vi" ? "Quét và xác minh" : "Scan and verify"}
      </button>
    </div>
  );
}

function RetryPanel({
  group,
  locale = defaultLocale,
  onFailure,
  onRetry,
  retries,
}: {
  group: StudyGroup;
  locale?: Locale;
  onFailure: () => void;
  onRetry: (errorCode: string) => void;
  retries: number;
}) {
  const errors: Record<StudyGroup, Array<{ code: string; label: LocalizedText }>> = {
    QR_PIN: [
      { code: "wrong_amount", label: { vi: "Nhập sai số tiền", en: "Wrong amount entered" } },
      { code: "pin_failed", label: { vi: "Nhập sai PIN", en: "Incorrect PIN" } },
    ],
    NFC_CARD: [
      { code: "nfc_read_error", label: { vi: "Lỗi đọc thẻ", en: "Card read error" } },
      { code: "wrong_card", label: { vi: "Thẻ không khớp phiên", en: "Card does not match session" } },
    ],
    FACE_POS: [
      {
        code: "no_face",
        label: { vi: "Camera POS không thấy khuôn mặt", en: "POS camera cannot see a face" },
      },
      { code: "multiple_faces", label: { vi: "Có nhiều khuôn mặt", en: "Multiple faces detected" } },
      {
        code: "low_quality",
        label: { vi: "Hình ảnh camera POS chưa đủ rõ", en: "POS camera image is not clear enough" },
      },
      { code: "face_no_match", label: { vi: "Face ID không khớp mẫu", en: "Face ID does not match sample" } },
      {
        code: "camera_disconnected",
        label: { vi: "Camera POS mất kết nối", en: "POS camera disconnected" },
      },
    ],
    PALM_VEIN: [
      { code: "no_hand", label: { vi: "Không phát hiện bàn tay", en: "No hand detected" } },
      { code: "bad_distance", label: { vi: "Khoảng cách không phù hợp", en: "Distance is not suitable" } },
      {
        code: "low_quality",
        label: { vi: "Mẫu không đủ chất lượng", en: "Sample quality is not sufficient" },
      },
      { code: "palm_no_match", label: { vi: "Không khớp mẫu", en: "Palm sample does not match" } },
      {
        code: "scanner_disconnected",
        label: { vi: "Thiết bị mất kết nối", en: "Scanner disconnected" },
      },
    ],
  };

  return (
    <aside className="self-start rounded-lg border border-[#ead8bf] bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <CircleHelp className="text-[#52693d]" size={22} aria-hidden />
        <h3 className="text-base font-extrabold">
          {locale === "vi" ? "Gặp sự cố?" : "Having trouble?"}
        </h3>
      </div>
      <div className="space-y-3">
        {errors[group].map((error) => (
          <button
            className="inline-flex min-h-[56px] w-full items-center justify-start gap-3 rounded-lg border border-[#ead8bf] bg-white px-3 py-2 text-left text-sm font-semibold leading-5 text-stone-800 transition hover:border-[#c9955d] disabled:text-[#b8a491]"
            disabled={retries >= 2}
            key={error.code}
            onClick={() => onRetry(error.code)}
            type="button"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fff3df] text-[#9a6237]">
              <AlertTriangle size={16} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 break-words">
              {localizeText(error.label, locale)}
            </span>
            <ArrowRight className="text-[#7b4325]" size={18} aria-hidden />
          </button>
        ))}
      </div>
      <div className="mt-5 border-t border-[#ead8bf] pt-5">
        <div className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#f1f6ed] px-4 text-sm text-stone-600">
          <TimerReset className="text-[#52693d]" size={20} aria-hidden />
          {locale === "vi" ? "Đã thử" : "Tried"}:{" "}
          <span className="font-extrabold text-stone-950">{retries}/2</span>
        </div>
        <p className="mt-4 max-w-[250px] text-sm leading-6 text-stone-500">
          {locale === "vi"
            ? "Nếu vẫn không được, hãy thử lại hoặc đổi phương thức thanh toán."
            : "If it still does not work, retry or switch payment method."}
        </p>
        <Image
          alt=""
          aria-hidden
          className="ml-auto mt-2 h-auto w-28 opacity-85"
          height={1254}
          src="/leaves.png"
          width={1254}
        />
      </div>
      <button
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-40"
        disabled={retries < 2}
        onClick={onFailure}
        type="button"
      >
        {locale === "vi" ? "Ghi nhận lỗi kỹ thuật" : "Record technical failure"}
      </button>
    </aside>
  );
}

function SuccessScreen({
  locale = defaultLocale,
  onContinue,
  transaction,
}: {
  locale?: Locale;
  onContinue: () => void;
  transaction?: TransactionRecord | null;
}) {
  const paidAmount = transaction?.amount ?? 0;
  const balanceAfter = transaction?.balance_after ?? startingBalance - paidAmount;

  return (
    <section className="flex min-h-[calc(100vh-8rem)] items-center justify-center rounded-lg border border-[#ead8bf] bg-white p-5">
      <div className="w-full max-w-[560px] rounded-lg border border-[#ead8bf] bg-[#fffaf7] px-7 py-8 text-center">
        <div className="relative mx-auto mb-5 h-28 w-44">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <CoffeeLeafGraphic
              className="h-full w-full"
              coffeeClassName="bottom-0 left-2 h-24 w-24"
              leavesClassName="-right-1 top-0 h-28 w-28 rotate-6"
            />
          </div>
          <Sparkles className="absolute left-1 top-5 text-[#d2b06f]" size={22} aria-hidden />
          <Sparkles className="absolute right-8 top-4 text-[#bfc9ac]" size={18} aria-hidden />
          <div className="absolute left-1/2 top-4 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-[#e8f0e2] text-[#47683f]">
            <CheckCircle2 size={40} strokeWidth={1.8} aria-hidden />
          </div>
        </div>
        <h1 className="text-3xl font-extrabold text-[#7b4325]">
          {locale === "vi" ? "Thanh toán thành công" : "Payment successful"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          {locale === "vi"
            ? "Giao dịch của bạn đã được xử lý thành công. Cảm ơn bạn đã tham gia nghiên cứu!"
            : "Your transaction was processed successfully. Thank you for joining the study!"}
        </p>
        <div className="mt-7 border-t border-[#ead8bf] pt-4 text-left">
          {[
            {
              Icon: Coffee,
              label: locale === "vi" ? "Đơn hàng" : "Order",
              value: transaction?.product ?? (locale === "vi" ? "Đơn cafe" : "Cafe order"),
            },
            {
              Icon: WalletCards,
              label: locale === "vi" ? "Đã thanh toán" : "Paid",
              value: formatVnd(paidAmount),
            },
            {
              Icon: ReceiptText,
              label: locale === "vi" ? "Số dư còn lại" : "Remaining balance",
              value: formatVnd(balanceAfter),
            },
          ].map(({ Icon, label, value }) => (
            <div
              className="flex items-center justify-between gap-5 border-b border-[#ead8bf] py-3 last:border-0"
              key={label}
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#ead8bf] bg-[#fff3df] text-[#7b4325]">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="text-base font-medium text-stone-500">{label}</span>
              </div>
              <span className="text-right text-base font-extrabold text-[#4f2f1c]">
                {value}
              </span>
            </div>
          ))}
        </div>
        <button
          className={cn(primaryButtonClass, "mt-6 h-12 w-full text-base")}
          onClick={onContinue}
          type="button"
        >
          {t("surveyContinue", locale)}
          <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    </section>
  );
}

function DebriefScreen({
  locale = defaultLocale,
  onExport,
  onExportCsv,
  onNew,
  session,
}: {
  locale?: Locale;
  onExport: (selectedGroups: StudyGroup[]) => void;
  onExportCsv: (selectedGroups: StudyGroup[]) => void;
  onNew: () => void;
  session: ExperimentSession;
}) {
  const [pendingExportFormat, setPendingExportFormat] = useState<ExportFormat | null>(null);
  const exportSessions = useMemo(() => allStoredSessions(session), [session]);
  const handleExportConfirm = (selectedGroups: StudyGroup[]) => {
    if (pendingExportFormat === "xlsx") {
      onExport(selectedGroups);
    }
    if (pendingExportFormat === "csv") {
      onExportCsv(selectedGroups);
    }
    setPendingExportFormat(null);
  };

  return (
    <>
      <Panel
        eyebrow={locale === "vi" ? "Phần 3 / 3" : "Part 3 / 3"}
        icon={CheckCircle2}
        title={locale === "vi" ? "PHẦN KẾT" : "CONCLUSION"}
      >
      <div className="rounded-lg border border-[#ead8bf] bg-white p-4 text-sm leading-6 text-stone-600">
        <p className="whitespace-pre-line">
          {locale === "vi"
            ? "Xin chân thành cảm ơn Anh chị/các bạn đã dành thời gian quý báu để trải nghiệm và thực hiện bài thí nghiệm sản phẩm demo của nhóm chúng tôi.\n\nMọi ý kiến đóng góp và thông tin bạn cung cấp là những dữ liệu vô cùng giá trị, giúp nhóm cải thiện và hoàn thiện sản phẩm tốt hơn trong tương lai. Chúng tôi xin cam kết toàn bộ thông tin thu thập được sẽ được bảo mật tuyệt đối và chỉ sử dụng duy nhất cho mục đích nghiên cứu phát triển sản phẩm, không dùng cho bất kỳ hoạt động thương mại nào khác.\n\nMột lần nữa, xin trân trọng cảm ơn sự hỗ trợ của các bạn!"
            : "Thank you sincerely for taking your valuable time to experience and complete our group's demo product experiment.\n\nAll feedback and information you provide are highly valuable data that help our group improve and complete the product in the future. We commit that all collected information will be kept strictly confidential and used only for product development research purposes, not for any other commercial activities.\n\nOnce again, thank you sincerely for your support!"}
        </p>
        {(session.assigned_group === "FACE_POS" ||
          session.assigned_group === "PALM_VEIN") && (
          <p className="mt-3 font-medium text-[#7a4a2a]">
            {locale === "vi" ? "Mẫu sinh trắc học của phiên đã được xóa lúc" : "The biometric template for this session was deleted at"}{" "}
            {session.template_deleted_at ?? (locale === "vi" ? "kết thúc phiên" : "session end")}.
          </p>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
          onClick={() => setPendingExportFormat("xlsx")}
          type="button"
        >
          <Download size={17} aria-hidden />
          {t("methodExcel", locale)}
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#ead8bf] bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
          onClick={() => setPendingExportFormat("csv")}
          type="button"
        >
          <Download size={17} aria-hidden />
          {t("dataCsv", locale)}
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6f3f24] px-4 text-sm font-semibold text-white transition hover:bg-[#5a341f]"
          onClick={onNew}
          type="button"
        >
          <UserPlus size={17} aria-hidden />
          {t("newSession", locale)}
        </button>
      </div>
      </Panel>
      {pendingExportFormat && (
        <ExportMethodDialog
          format={pendingExportFormat}
          locale={locale}
          onCancel={() => setPendingExportFormat(null)}
          onConfirm={handleExportConfirm}
          sessions={exportSessions}
        />
      )}
    </>
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
    <section className="min-h-[calc(100vh-8rem)] rounded-lg border border-[#ead8bf] bg-white p-5 sm:p-6 lg:p-7">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#ead8bf] bg-[#fff3df] text-[#7b4325]">
          <Icon size={22} aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#9a4f1f]">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-normal text-[#17120f]">
            {title}
          </h1>
        </div>
      </div>
      {children}
    </section>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex justify-end border-t border-[#ead8bf] pt-5">
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
          className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-lg border border-[#d6b896] bg-[#fffaf3] p-1"
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
