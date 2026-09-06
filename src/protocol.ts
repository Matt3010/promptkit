export type PromptKitTone =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "special";

export interface PromptKitTheme {
  accent?: string;
  accentMuted?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  danger?: string;
  warning?: string;
  success?: string;
  info?: string;
  special?: string;
}

export interface PromptKitManifest {
  name: string;
  prompt?: string;
  subtitle?: string;
  commands?: string[];
  theme?: PromptKitTheme;
  events?: {
    url: string;
  };
}

export interface PromptKitCommandRequest {
  input: string;
}

export interface TextBlock {
  type: "text";
  text: string;
  tone?: PromptKitTone;
}

export interface TableBlock {
  type: "table";
  columns?: string[];
  rows: string[][];
  tone?: PromptKitTone;
}

export interface CodeBlock {
  type: "code";
  code: string;
  language?: string;
  tone?: PromptKitTone;
}

export interface StatusBlock {
  type: "status";
  label: string;
  value: string;
  tone?: PromptKitTone;
}

export interface ProgressBlock {
  type: "progress";
  label?: string;
  value: number;
  max?: number;
  tone?: PromptKitTone;
}

export interface DownloadBlock {
  type: "download";
  label: string;
  filename: string;
  content: string;
  mediaType?: string;
}

export interface SeparatorBlock {
  type: "separator";
}

export type PromptKitBlock =
  | TextBlock
  | TableBlock
  | CodeBlock
  | StatusBlock
  | ProgressBlock
  | DownloadBlock
  | SeparatorBlock;

export interface PromptKitCommandResponse {
  ok: boolean;
  blocks: PromptKitBlock[];
  state?: Record<string, string | number | boolean | null>;
  /** Clear previous output before rendering this response. */
  clear?: boolean;
}

export interface PromptKitEvent {
  id?: string;
  blocks?: PromptKitBlock[];
  state?: Record<string, string | number | boolean | null>;
}

export function isPromptKitManifest(value: unknown): value is PromptKitManifest {
  if (!isRecord(value) || typeof value.name !== "string") return false;
  if (value.prompt !== undefined && typeof value.prompt !== "string") return false;
  if (value.subtitle !== undefined && typeof value.subtitle !== "string") return false;
  if (value.commands !== undefined) {
    if (!Array.isArray(value.commands) || !value.commands.every((item) => typeof item === "string")) {
      return false;
    }
  }
  if (value.events !== undefined) {
    if (!isRecord(value.events) || typeof value.events.url !== "string") return false;
  }
  return true;
}

export function isPromptKitCommandResponse(value: unknown): value is PromptKitCommandResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean" || !Array.isArray(value.blocks)) return false;
  if (value.clear !== undefined && typeof value.clear !== "boolean") return false;
  return value.blocks.every(isPromptKitBlock);
}

export function isPromptKitEvent(value: unknown): value is PromptKitEvent {
  if (!isRecord(value)) return false;
  if (value.id !== undefined && typeof value.id !== "string") return false;
  if (value.blocks !== undefined) {
    if (!Array.isArray(value.blocks) || !value.blocks.every(isPromptKitBlock)) return false;
  }
  if (value.state !== undefined && !isState(value.state)) return false;
  return true;
}

export function isPromptKitBlock(value: unknown): value is PromptKitBlock {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "text":
      return typeof value.text === "string" && validTone(value.tone);
    case "table":
      return (
        Array.isArray(value.rows) &&
        value.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string")) &&
        (value.columns === undefined ||
          (Array.isArray(value.columns) && value.columns.every((column) => typeof column === "string"))) &&
        validTone(value.tone)
      );
    case "code":
      return (
        typeof value.code === "string" &&
        (value.language === undefined || typeof value.language === "string") &&
        validTone(value.tone)
      );
    case "status":
      return typeof value.label === "string" && typeof value.value === "string" && validTone(value.tone);
    case "progress":
      return (
        typeof value.value === "number" &&
        Number.isFinite(value.value) &&
        (value.max === undefined || (typeof value.max === "number" && Number.isFinite(value.max))) &&
        (value.label === undefined || typeof value.label === "string") &&
        validTone(value.tone)
      );
    case "download":
      return (
        typeof value.label === "string" &&
        typeof value.filename === "string" &&
        typeof value.content === "string" &&
        (value.mediaType === undefined || typeof value.mediaType === "string")
      );
    case "separator":
      return true;
    default:
      return false;
  }
}

function validTone(value: unknown): boolean {
  return (
    value === undefined ||
    value === "primary" ||
    value === "secondary" ||
    value === "success" ||
    value === "warning" ||
    value === "danger" ||
    value === "info" ||
    value === "special"
  );
}

function isState(value: unknown): value is Record<string, string | number | boolean | null> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (item) => item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
