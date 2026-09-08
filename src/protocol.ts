export type PromptKitTone =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "special";

export type PromptKitState = Record<string, string | number | boolean | null>;
export type PromptKitBlockUpdate = "append" | "replace";
export type PromptKitDownloadBehavior = "manual" | "auto";
export type PromptKitEventTransport = "sse";

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

export interface PromptKitEventSource {
  url: string;
  /** Event transport. SSE is the current default and only built-in transport. */
  transport?: PromptKitEventTransport;
}

export interface PromptKitBootstrapSource {
  /** Idempotent GET endpoint returning the initial UI snapshot. */
  url: string;
}

export interface PromptKitCommandRequest {
  input: string;
}

interface PromptKitBlockIdentity {
  /** Stable host-defined identity used for in-place updates. */
  id?: string;
  /** Replace the latest block with the same id instead of appending. Defaults to append. */
  update?: PromptKitBlockUpdate;
}

export interface TextBlock extends PromptKitBlockIdentity {
  type: "text";
  text: string;
  tone?: PromptKitTone;
}

export interface TableBlock extends PromptKitBlockIdentity {
  type: "table";
  columns?: string[];
  rows: string[][];
  tone?: PromptKitTone;
}

export interface CodeBlock extends PromptKitBlockIdentity {
  type: "code";
  code: string;
  language?: string;
  tone?: PromptKitTone;
}

export interface StatusBlock extends PromptKitBlockIdentity {
  type: "status";
  label: string;
  value: string;
  tone?: PromptKitTone;
}

export interface ProgressBlock extends PromptKitBlockIdentity {
  type: "progress";
  label?: string;
  value: number;
  max?: number;
  tone?: PromptKitTone;
}

export interface DownloadBlock extends PromptKitBlockIdentity {
  type: "download";
  label: string;
  filename: string;
  content: string;
  mediaType?: string;
  /** Manual renders the existing download control. Auto downloads immediately and stays visually hidden. */
  behavior?: PromptKitDownloadBehavior;
}

export interface SeparatorBlock extends PromptKitBlockIdentity {
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

export interface PromptKitSnapshot {
  blocks?: PromptKitBlock[];
  state?: PromptKitState;
  /** Switch to a named manifest theme variant. Null returns to the default theme. */
  themeVariant?: string | null;
  /** Replace the complete set of visible indicators. */
  indicators?: PromptKitIndicator[];
  /** Clear previous output before rendering this snapshot. */
  clear?: boolean;
}

/**
 * Declarative action feedback. Every string may contain supported context
 * placeholders such as {{files[0].name}}, {{indicator.label}} or
 * {{error.message}}. PromptKit resolves the template before applying it.
 */
export interface PromptKitActionFeedback {
  /** Optional feedback applied immediately before the action handler runs. */
  before?: PromptKitSnapshot;
  /** Optional feedback applied when the action handler fails. */
  error?: PromptKitSnapshot;
}

/** Optional presentation overrides for the generic action UI. */
export interface PromptKitActionUi {
  /** Template shown above the chooser. Defaults to the selected filenames. */
  chooserLabel?: string;
  /** Optional feedback when a drop matches no registered action. */
  noMatch?: PromptKitSnapshot;
}

export interface PromptKitActionDefinition {
  id: string;
  label?: string;
  tone?: PromptKitTone;
  triggers?: PromptKitActionTrigger[];
  /** Declarative presentation feedback; action semantics stay in the handler. */
  feedback?: PromptKitActionFeedback;
}

export interface PromptKitManifest {
  name: string;
  prompt?: string;
  subtitle?: string;
  commands?: string[];
  theme?: PromptKitTheme;
  actions?: PromptKitActionDefinition[];
  /** Optional presentation overrides shared by generic action UI. */
  actionUi?: PromptKitActionUi;
  /** Optional initial snapshot loaded before the live event stream is opened. */
  bootstrap?: PromptKitBootstrapSource;
  events?: PromptKitEventSource;
}

export interface PromptKitEvent extends PromptKitSnapshot {
  id?: string;
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
  if (value.actionUi !== undefined && !isActionUi(value.actionUi)) return false;
  if (value.bootstrap !== undefined && !isBootstrapSource(value.bootstrap)) return false;
  if (value.events !== undefined && !isEventSource(value.events)) return false;
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

export function isPromptKitSnapshot(value: unknown): value is PromptKitSnapshot {
  if (!isRecord(value)) return false;
  if (value.blocks !== undefined) {
    if (!Array.isArray(value.blocks) || !value.blocks.every(isPromptKitBlock)) return false;
  }
  if (value.clear !== undefined && typeof value.clear !== "boolean") return false;
  if (value.state !== undefined && !isState(value.state)) return false;
  if (!validThemeVariant(value.themeVariant)) return false;
  if (value.indicators !== undefined) {
    if (!Array.isArray(value.indicators) || !value.indicators.every(isIndicator)) return false;
  }
  return true;
}

export function isPromptKitEvent(value: unknown): value is PromptKitEvent {
  if (!isRecord(value) || !isPromptKitSnapshot(value)) return false;
  return value.id === undefined || typeof value.id === "string";
}

export function isPromptKitBlock(value: unknown): value is PromptKitBlock {
  if (!isRecord(value) || typeof value.type !== "string" || !validBlockIdentity(value)) return false;

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
        (value.mediaType === undefined || typeof value.mediaType === "string") &&
        (value.behavior === undefined || value.behavior === "manual" || value.behavior === "auto")
      );
    case "separator":
      return true;
    default:
      return false;
  }
}

function isBootstrapSource(value: unknown): value is PromptKitBootstrapSource {
  return isRecord(value) && typeof value.url === "string" && value.url.length > 0;
}

function isEventSource(value: unknown): value is PromptKitEventSource {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    (value.transport === undefined || value.transport === "sse")
  );
}

function validBlockIdentity(value: Record<string, unknown>): boolean {
  if (value.id !== undefined && (typeof value.id !== "string" || value.id.length === 0)) return false;
  return value.update === undefined || value.update === "append" || value.update === "replace";
}

function isActionDefinition(value: unknown): value is PromptKitActionDefinition {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) return false;
  if (value.label !== undefined && typeof value.label !== "string") return false;
  if (!validTone(value.tone)) return false;
  if (value.triggers !== undefined) {
    if (!Array.isArray(value.triggers) || !value.triggers.every(isActionTrigger)) return false;
  }
  if (value.feedback !== undefined && !isActionFeedback(value.feedback)) return false;
  return true;
}

function isActionFeedback(value: unknown): value is PromptKitActionFeedback {
  if (!isRecord(value)) return false;
  if (value.before !== undefined && !isFeedbackTemplate(value.before)) return false;
  if (value.error !== undefined && !isFeedbackTemplate(value.error)) return false;
  return true;
}

function isActionUi(value: unknown): value is PromptKitActionUi {
  if (!isRecord(value)) return false;
  if (value.chooserLabel !== undefined) {
    if (typeof value.chooserLabel !== "string" || !validTemplateString(value.chooserLabel)) return false;
  }
  if (value.noMatch !== undefined && !isFeedbackTemplate(value.noMatch)) return false;
  return true;
}

function isFeedbackTemplate(value: unknown): value is PromptKitSnapshot {
  return isPromptKitSnapshot(value) && validTemplates(value);
}

function validTemplates(value: unknown): boolean {
  if (typeof value === "string") return validTemplateString(value);
  if (Array.isArray(value)) return value.every(validTemplates);
  if (!isRecord(value)) return true;
  return Object.values(value).every(validTemplates);
}

function validTemplateString(value: string): boolean {
  const tokenPattern = /\{\{\s*([^{}]+?)\s*\}\}/gu;
  let match: RegExpExecArray | null;
  let consumed = "";
  let cursor = 0;

  while ((match = tokenPattern.exec(value)) !== null) {
    consumed += value.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    if (!validTemplateToken(match[1] ?? "")) return false;
  }
  consumed += value.slice(cursor);
  return !consumed.includes("{{") && !consumed.includes("}}");
}

function validTemplateToken(raw: string): boolean {
  const token = raw.trim();
  if (token === "action.id" || token === "action.label") return true;
  if (token === "files.count" || token === "indicator.id" || token === "indicator.label") return true;
  if (token === "error.message" || token === "payload") return true;
  return /^files\[\d+\]\.(?:name|type|size)$/u.test(token);
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
