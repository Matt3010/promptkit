import type {
  PromptKitActionDefinition,
  PromptKitIndicator,
  PromptKitSnapshot,
} from "./protocol.js";
import { isPromptKitSnapshot } from "./protocol.js";

export interface PromptKitTemplateValues {
  action?: Pick<PromptKitActionDefinition, "id" | "label">;
  files?: File[];
  indicator?: PromptKitIndicator;
  payload?: unknown;
  error?: unknown;
}

export function resolvePromptKitSnapshotTemplate(
  template: PromptKitSnapshot,
  values: PromptKitTemplateValues,
): PromptKitSnapshot {
  const resolved = resolveValue(template, values);
  if (!isPromptKitSnapshot(resolved)) {
    throw new Error("PromptKit feedback template resolved to an invalid snapshot");
  }
  return resolved;
}

export function resolvePromptKitTextTemplate(
  template: string,
  values: PromptKitTemplateValues,
): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/gu, (_match, raw: string) => resolveToken(raw.trim(), values));
}

function resolveValue(value: unknown, values: PromptKitTemplateValues): unknown {
  if (typeof value === "string") return resolvePromptKitTextTemplate(value, values);
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, values));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, resolveValue(item, values)]),
  );
}

function resolveToken(token: string, values: PromptKitTemplateValues): string {
  switch (token) {
    case "action.id":
      return values.action?.id ?? "";
    case "action.label":
      return values.action?.label ?? values.action?.id ?? "";
    case "files.count":
      return values.files === undefined ? "" : String(values.files.length);
    case "indicator.id":
      return values.indicator?.id ?? "";
    case "indicator.label":
      return values.indicator?.label ?? "";
    case "error.message":
      return errorMessage(values.error);
    case "payload":
      return payloadText(values.payload);
    default:
      return resolveFileToken(token, values.files);
  }
}

function resolveFileToken(token: string, files: File[] | undefined): string {
  const match = /^files\[(\d+)\]\.(name|type|size)$/u.exec(token);
  if (!match) throw new Error(`PromptKit feedback template token is unsupported: ${token}`);
  const index = Number(match[1]);
  const file = files?.[index];
  if (!file) return "";

  switch (match[2]) {
    case "name":
      return file.name;
    case "type":
      return file.type;
    case "size":
      return String(file.size);
    default:
      return "";
  }
}

function errorMessage(error: unknown): string {
  if (error === undefined) return "";
  return error instanceof Error ? error.message : String(error);
}

function payloadText(payload: unknown): string {
  if (payload === undefined) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "number" || typeof payload === "boolean" || payload === null) return String(payload);
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
