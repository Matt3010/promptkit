export type PromptKitTone =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "special";

export type PromptKitState = Record<string, string | number | boolean | null>;

export interface PromptKitThemeTokens {
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

export interface PromptKitTheme {
  default?: PromptKitThemeTokens;
  variants?: Record<string, PromptKitThemeTokens>;
}

export interface PromptKitDropActionTrigger {
  type: "drop";
  /** File extensions (".json"), exact MIME types or MIME wildcards ("image/*"). */
  accept?: string[];
  /** Whether this action accepts more than one dropped file. Defaults to false. */
  multiple?: boolean;
}

export type PromptKitActionTrigger = PromptKitDropActionTrigger;

export interface PromptKitActionDefinition {
  id: string;
  label?: string;
  tone?: PromptKitTone;
  triggers?: PromptKitActionTrigger[];
}

export interface PromptKitIndicator {
  id: string;
  label: string;
  tone?: PromptKitTone;
  /** Inactive indicators are omitted from the UI. Defaults to true. */
  active?: boolean;
  pulse?: boolean;
  /** Optional action id invoked when the indicator is clicked. */
  action?: string;
}

export interface PromptKitManifest {
  name: string;
  prompt?: string;
  subtitle?: string;
  commands?: string[];
  theme?: PromptKitTheme;
  actions?: PromptKitActionDefinition[];
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
  state?: PromptKitState;
  /** Switch to a named manifest theme variant. Null returns to the default theme. */
  themeVariant?: string | null;
  /** Replace the complete set of visible indicators. */
  indicators?: PromptKitIndicator[];
  /** Clear previous output before rendering this response. */
  clear?: boolean;
}

export interface PromptKitEvent {
  id?: string;
  blocks?: PromptKitBlock[];
  state?: PromptKitState;
  /** Switch to a named manifest theme variant. Null returns to the default theme. */
  themeVariant?: string | null;
  /** Replace the complete set of visible indicators. */
  indicators?: PromptKitIndicator[];
}

export function isPromptKitManifest(value: unknown): value is PromptKitManifest {
  if (!isRecord(value) || typeof value.name !== "string") return false;
  if (value.prompt !== undefined && typeof value.prompt !== "string") return false;
  if (value.subtitle !== undefined && typeof value.subtitle !== "string") return false;
  if (value.commands !== undefined) {
    if (!Array.isArray(value.commands) || !value.commands.every((item) => typeof item === "string")) return false;
  }
  if (value.theme !== undefined && !isTheme(value.theme)) return false;
  if (value.actions !== undefined) {
    if (!Array.isArray(value.actions) || !value.actions.every(isActionDefinition)) return false;
  }
  if (value.events !== undefined) {
    if (!isRecord(value.events) || typeof value.events.url !== "string") return false;
  }
  return true;
}

export function isPromptKitCommandResponse(value: unknown): value is PromptKitCommandResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean" || !Array.isArray(value.blocks)) return false;
  if (!value.blocks.every(isPromptKitBlock)) return false;
  if (value.clear !== undefined && typeof value.clear !== "boolean") return false;
  if (value.state !== undefined && !isState(value.state)) return false;
  if (!validThemeVariant(value.themeVariant)) return false;
  if (value.indicators !== undefined) {
    if (!Array.isArray(value.indicators) || !value.indicators.every(isIndicator)) return false;
  }
  return true;
}

export function isPromptKitEvent(value: unknown): value is PromptKitEvent {
  if (!isRecord(value)) return false;
  if (value.id !== undefined && typeof value.id !== "string") return false;
  if (value.blocks !== undefined) {
    if (!Array.isArray(value.blocks) || !value.blocks.every(isPromptKitBlock)) return false;
  }
  if (value.state !== undefined && !isState(value.state)) return false;
  if (!validThemeVariant(value.themeVariant)) return false;
  if (value.indicators !== undefined) {
    if (!Array.isArray(value.indicators) || !value.indicators.every(isIndicator)) return false;
  }
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

function isActionDefinition(value: unknown): value is PromptKitActionDefinition {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) return false;
  if (value.label !== undefined && typeof value.label !== "string") return false;
  if (!validTone(value.tone)) return false;
  if (value.triggers !== undefined) {
    if (!Array.isArray(value.triggers) || !value.triggers.every(isActionTrigger)) return false;
  }
  return true;
}

function isActionTrigger(value: unknown): value is PromptKitActionTrigger {
  if (!isRecord(value) || value.type !== "drop") return false;
  if (value.multiple !== undefined && typeof value.multiple !== "boolean") return false;
  if (value.accept !== undefined) {
    if (!Array.isArray(value.accept) || !value.accept.every((item) => typeof item === "string")) return false;
  }
  return true;
}

function isIndicator(value: unknown): value is PromptKitIndicator {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.label === "string" &&
    validTone(value.tone) &&
    (value.active === undefined || typeof value.active === "boolean") &&
    (value.pulse === undefined || typeof value.pulse === "boolean") &&
    (value.action === undefined || typeof value.action === "string")
  );
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

function validThemeVariant(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isTheme(value: unknown): value is PromptKitTheme {
  if (!isRecord(value)) return false;
  if (value.default !== undefined && !isThemeTokens(value.default)) return false;
  if (value.variants !== undefined) {
    if (!isRecord(value.variants)) return false;
    if (!Object.values(value.variants).every(isThemeTokens)) return false;
  }
  return true;
}

function isThemeTokens(value: unknown): value is PromptKitThemeTokens {
  if (!isRecord(value)) return false;
  const keys: Array<keyof PromptKitThemeTokens> = [
    "accent",
    "accentMuted",
    "background",
    "foreground",
    "muted",
    "danger",
    "warning",
    "success",
    "info",
    "special",
  ];
  return keys.every((key) => value[key] === undefined || typeof value[key] === "string");
}

function isState(value: unknown): value is PromptKitState {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (item) => item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
