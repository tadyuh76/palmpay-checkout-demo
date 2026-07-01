import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  getPalmTemplate,
  markPalmTemplateDeleted,
  upsertPalmTemplate,
} from "@/lib/palm-template-store";

export type PalmSdkAction = "enroll" | "verify";

export type PalmSdkResult = {
  action?: PalmSdkAction;
  capTip?: number | null;
  deviceName?: string;
  distance?: number | null;
  error?: string;
  event?: "enrolled" | "matched";
  featureBytes?: number;
  framesSeen?: number;
  message?: string;
  ok: boolean;
  participantId?: string;
  sampleCount?: number;
  sdkReturn?: number | null;
  sdkVersion?: string;
  templateRef?: string;
  threshold?: number;
  transactionId?: string;
};

type RunPalmSdkInput = {
  participantId?: string;
  templateRef: string;
  transactionId?: string;
};

export type PalmSdkWorkerProcess =
  | { child: ChildProcessWithoutNullStreams; error?: never; templateRef: string; timeoutMs: number }
  | { child?: never; error: PalmSdkResult; templateRef: string; timeoutMs: number };

const defaultTimeoutMs = 45_000;
const palmRuntimeFiles = [
  "SonixCamera.dll",
  "XRCommonVeinAlgAPI.dll",
  "libusb-1.0.dll",
  "gmssl.dll",
  "liveness_roi",
  "reg_img.bin",
];

function hasPalmRuntimeFiles(dir: string) {
  return (
    fs.existsSync(path.join(dir, "SonixCamera.dll")) &&
    fs.existsSync(path.join(dir, "XRCommonVeinAlgAPI.dll")) &&
    fs.existsSync(path.join(dir, "libusb-1.0.dll"))
  );
}

function findPythonSdkDir(root: string) {
  const preferred = path.join(root, "data", "palm-python-sdk", "PythonProject1920");
  if (hasPalmRuntimeFiles(preferred) && fs.existsSync(path.join(preferred, "camer.py"))) {
    return preferred;
  }

  const stack = [root];
  while (stack.length) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    const names = new Set(entries.map((entry) => entry.name.toLowerCase()));
    if (
      names.has("camer.py") &&
      names.has("sonixcamera.dll") &&
      names.has("xrcommonveinalgapi.dll") &&
      names.has("libusb-1.0.dll")
    ) {
      return current;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === ".git" ||
        entry.name === "palm-templates" ||
        entry.name === "palm-sdk-runtime"
      ) {
        continue;
      }
      stack.push(path.join(current, entry.name));
    }
  }

  return null;
}

function walkForSdkDir(root: string) {
  const pythonSdkDir = findPythonSdkDir(root);
  if (pythonSdkDir) return pythonSdkDir;

  const preferredSegments = [
    "PC-based C   development",
    "PC-based C++ development",
    "(c++) Demonstration source code of palm vein module SDK - Description of the usage file",
    "demo source code（C++）",
    "c++ 640源码",
    "640",
    "CameraSDK",
    "run",
  ];
  const preferred = path.join(root, ...preferredSegments);
  if (
    fs.existsSync(path.join(preferred, "SonixCamera.dll")) &&
    fs.existsSync(path.join(preferred, "XRCommonVeinAlgAPI.dll")) &&
    fs.existsSync(path.join(preferred, "libusb-1.0.dll"))
  ) {
    return preferred;
  }

  const stack = [root];
  let fallback: string | null = null;

  while (stack.length) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    const names = new Set(entries.map((entry) => entry.name.toLowerCase()));
    const hasRuntimeDlls =
      names.has("sonixcamera.dll") &&
      names.has("xrcommonveinalgapi.dll") &&
      names.has("libusb-1.0.dll");

    if (hasRuntimeDlls) {
      if (names.has("sn_demo.exe")) return current;
      fallback = fallback ?? current;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === ".git" ||
        entry.name === "data"
      ) {
        continue;
      }
      stack.push(path.join(current, entry.name));
    }
  }

  return fallback;
}

export function palmSdkDir() {
  const configured = process.env.PALMPAY_PALM_SDK_DIR?.trim();
  if (configured) return configured;

  const found = walkForSdkDir(process.cwd());
  if (!found) {
    throw new Error(
      "Palm vein SDK DLLs were not found. Set PALMPAY_PALM_SDK_DIR to the folder containing SonixCamera.dll.",
    );
  }
  return found;
}

function palmSdkRuntimeDir() {
  return (
    process.env.PALMPAY_PALM_RUNTIME_DIR?.trim() ||
    path.join(process.cwd(), "data", "palm-sdk-runtime")
  );
}

function copyIfChanged(source: string, destination: string) {
  const sourceStat = fs.statSync(source);
  const destinationStat = fs.existsSync(destination) ? fs.statSync(destination) : null;
  if (
    destinationStat &&
    destinationStat.size === sourceStat.size &&
    destinationStat.mtimeMs >= sourceStat.mtimeMs
  ) {
    return;
  }
  fs.copyFileSync(source, destination);
}

function stagePalmSdkRuntime(sourceDir: string) {
  const runtimeDir = palmSdkRuntimeDir();
  fs.mkdirSync(runtimeDir, { recursive: true });

  for (const fileName of palmRuntimeFiles) {
    const source = path.join(sourceDir, fileName);
    if (!fs.existsSync(source)) continue;
    copyIfChanged(source, path.join(runtimeDir, fileName));
  }

  for (const fileName of ["SonixCamera.dll", "XRCommonVeinAlgAPI.dll", "libusb-1.0.dll"]) {
    if (!fs.existsSync(path.join(runtimeDir, fileName))) {
      throw new Error(`Palm SDK runtime file is missing: ${fileName}`);
    }
  }

  return runtimeDir;
}

export function palmTemplatesDir() {
  return (
    process.env.PALMPAY_PALM_TEMPLATE_DIR?.trim() ||
    path.join(process.cwd(), "data", "palm-templates")
  );
}

function pythonExecutable() {
  return process.env.PALMPAY_PALM_PYTHON?.trim() || "python";
}

function sanitizeTemplateRef(templateRef: string) {
  const sanitized = templateRef.trim().replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 120);
  return sanitized || "template";
}

function palmTemplatePath(templateRef: string) {
  return path.join(palmTemplatesDir(), `${sanitizeTemplateRef(templateRef)}.bin`);
}

async function restorePalmTemplateFromDb(templateRef: string) {
  const template = await getPalmTemplate(templateRef);
  if (!template) return false;

  const filePath = palmTemplatePath(templateRef);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, template.data);
  return true;
}

async function storePalmTemplateInDb(input: {
  participantId?: string;
  result: PalmSdkResult;
  templateRef: string;
  transactionId?: string;
}) {
  const filePath = palmTemplatePath(input.templateRef);
  if (!fs.existsSync(filePath)) return false;

  await upsertPalmTemplate({
    data: fs.readFileSync(filePath),
    metadata: {
      deviceName: input.result.deviceName,
      featureBytes: input.result.featureBytes,
      framesSeen: input.result.framesSeen,
      sampleCount: input.result.sampleCount,
      sdkVersion: input.result.sdkVersion,
    },
    participantId: input.participantId,
    templateRef: input.templateRef,
    transactionId: input.transactionId,
  });

  return true;
}

export async function deletePalmTemplate(templateRef: string) {
  const filePath = palmTemplatePath(templateRef);
  const deletedFromDb = await markPalmTemplateDeleted(templateRef);
  let deletedFromDisk = false;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    deletedFromDisk = true;
  }
  return deletedFromDb || deletedFromDisk;
}

function palmSdkWorkerConfig(
  action: PalmSdkAction,
  input: RunPalmSdkInput,
  extraArgs: string[] = [],
):
  | {
      args: string[];
      sdkDir: string;
      templateRef: string;
      timeoutMs: number;
      workerPath: string;
    }
  | { result: PalmSdkResult; templateRef: string; timeoutMs: number } {
  const templateRef = input.templateRef.trim();
  if (!templateRef) {
    return {
      result: { ok: false, action, error: "missing_template_ref" },
      templateRef,
      timeoutMs: defaultTimeoutMs,
    };
  }

  const workerPath = path.join(process.cwd(), "scripts", "palm-sdk-worker.py");
  if (!fs.existsSync(workerPath)) {
    return {
      result: {
        ok: false,
        action,
        error: "worker_not_found",
        message: `Missing worker at ${workerPath}`,
        templateRef,
      },
      templateRef,
      timeoutMs: defaultTimeoutMs,
    };
  }

  const templatesDir = palmTemplatesDir();
  fs.mkdirSync(templatesDir, { recursive: true });

  const timeoutMs = Number(process.env.PALMPAY_PALM_SCAN_TIMEOUT_MS || defaultTimeoutMs);
  const timeoutSec = Math.max(5, Math.ceil(timeoutMs / 1000) - 2);
  const sdkDir = stagePalmSdkRuntime(palmSdkDir());
  const args = [
    workerPath,
    "--action",
    action,
    "--sdk-dir",
    sdkDir,
    "--templates-dir",
    templatesDir,
    "--template-ref",
    templateRef,
    "--timeout-sec",
    String(timeoutSec),
    ...extraArgs,
  ];

  if (input.participantId) {
    args.push("--participant-id", input.participantId);
  }
  if (input.transactionId) {
    args.push("--transaction-id", input.transactionId);
  }

  return { args, sdkDir, templateRef, timeoutMs, workerPath };
}

export function spawnPalmSdkWorker(
  action: PalmSdkAction,
  input: RunPalmSdkInput,
  extraArgs: string[] = [],
): PalmSdkWorkerProcess {
  const config = palmSdkWorkerConfig(action, input, extraArgs);
  if ("result" in config) {
    return {
      error: config.result,
      templateRef: config.templateRef,
      timeoutMs: config.timeoutMs,
    };
  }

  return {
    child: spawn(pythonExecutable(), config.args, {
      cwd: config.sdkDir,
      env: process.env,
      windowsHide: true,
    }),
    templateRef: config.templateRef,
    timeoutMs: config.timeoutMs,
  };
}

export async function preparePalmSdkWorker(
  action: PalmSdkAction,
  input: RunPalmSdkInput,
  extraArgs: string[] = [],
) {
  if (action === "verify" && input.templateRef.trim()) {
    await restorePalmTemplateFromDb(input.templateRef.trim());
  }

  return spawnPalmSdkWorker(action, input, extraArgs);
}

export async function persistPalmSdkResult(
  action: PalmSdkAction,
  input: RunPalmSdkInput,
  result: PalmSdkResult,
) {
  if (action !== "enroll" || !result.ok) return result;

  const templateRef = result.templateRef || input.templateRef.trim();
  if (!templateRef) return result;

  await storePalmTemplateInDb({
    participantId: input.participantId,
    result,
    templateRef,
    transactionId: input.transactionId,
  });

  return result;
}

export async function runPalmSdk(
  action: PalmSdkAction,
  input: RunPalmSdkInput,
): Promise<PalmSdkResult> {
  const worker = await preparePalmSdkWorker(action, input);
  if (worker.error) return worker.error;

  return new Promise((resolve) => {
    const { child, templateRef, timeoutMs } = worker;
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      resolve({
        ok: false,
        action,
        error: "sdk_timeout",
        message: `Palm SDK did not finish within ${timeoutMs}ms`,
        templateRef,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        action,
        error: "sdk_process_error",
        message: `${error.message}. Set PALMPAY_PALM_PYTHON if Python is not on PATH.`,
        templateRef,
      });
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const lines = stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const jsonLine = [...lines].reverse().find((line) => line.startsWith("{"));

      if (!jsonLine) {
        resolve({
          ok: false,
          action,
          error: "sdk_no_json",
          message: stderr.trim() || stdout.trim() || "Palm SDK worker did not return JSON",
          templateRef,
        });
        return;
      }

      try {
        const parsed = JSON.parse(jsonLine) as PalmSdkResult;
        void persistPalmSdkResult(action, input, parsed)
          .then(resolve)
          .catch((error) =>
            resolve({
              ok: false,
              action,
              error: "palm_template_store_failed",
              message: error instanceof Error ? error.message : String(error),
              templateRef,
            }),
          );
      } catch (error) {
        resolve({
          ok: false,
          action,
          error: "sdk_bad_json",
          message: error instanceof Error ? error.message : String(error),
          templateRef,
        });
      }
    });
  });
}
