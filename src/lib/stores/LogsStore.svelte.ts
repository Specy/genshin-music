import { APP_NAME, APP_VERSION } from '$core/legacyConfig';

export type LogSource = 'console' | 'uncaught' | 'rejection';

export type Log = {
  error?: Error;
  message: string;
  source: LogSource;
  // ms epoch
  time: number;
  // the in-app path the error happened on
  page: string;
  // how many times this same log repeated back to back
  count: number;
};

type StoredLog = Omit<Log, 'error'>;

// Logs survive a reload (an error often breaks the page, and the user reloads before opening
// /error), but only the last MAX_LOGS of them, each capped at MAX_MESSAGE_LENGTH characters.
const STORAGE_KEY = `${APP_NAME}_Error_Logs`;
const MAX_LOGS = 100;
const MAX_MESSAGE_LENGTH = 10_000;

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return String(value);
  try {
    return JSON.stringify(value, null, 4) ?? String(value);
  } catch {
    // cyclic or otherwise unserializable
    return String(value);
  }
}

/**
 * Renders an error with its name, message, stack and `cause` chain.
 * V8 starts `stack` with "Name: message", but Safari (JSC) and Firefox give only the frames, so
 * using `stack` alone loses the message there - on iOS a JSON.parse failure was logged as just
 * `parse@[native code]`.
 */
export function formatError(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return stringify(error);
  const head = `${error.name}: ${error.message}`;
  const stack = error.stack?.trim() ?? '';
  let text = !stack ? head : stack.startsWith(head) ? stack : `${head}\n${stack}`;
  if (error.cause !== undefined && depth < 5) {
    text += `\nCaused by: ${formatError(error.cause, depth + 1)}`;
  }
  return text;
}

export function formatLogArgs(args: unknown[]): string {
  return args.map((arg) => formatError(arg)).join(' ');
}

function loadStoredLogs(): Log[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as StoredLog[]) : [];
  } catch {
    return [];
  }
}

class LogsStore {
  logs: Log[] = $state(typeof localStorage === 'undefined' ? [] : loadStoredLogs());

  addLog(log: { error?: Error; message: string; source: LogSource }) {
    const message =
      log.message.length > MAX_MESSAGE_LENGTH
        ? `${log.message.slice(0, MAX_MESSAGE_LENGTH)}… (truncated)`
        : log.message;
    // The same error object is often reported twice (console.error + the window error event),
    // and a broken render loop repeats one message many times: fold both into a count.
    const duplicate = log.error && this.logs.find((l) => l.error === log.error);
    const last = this.logs.at(-1);
    const repeat = duplicate || (last?.message === message ? last : undefined);
    if (repeat) {
      repeat.count++;
      repeat.time = Date.now();
    } else {
      this.logs.push({
        error: log.error,
        message,
        source: log.source,
        time: Date.now(),
        page: `${location.pathname}${location.search}`,
        count: 1,
      });
      if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    }
    this.persist();
  }

  clearLogs() {
    this.logs.splice(0, this.logs.length);
    this.persist();
  }

  /** Everything a bug report needs, logs plus the environment they happened in. */
  getReport() {
    const standalone =
      typeof matchMedia !== 'undefined' &&
      ['standalone', 'fullscreen'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
    return {
      app: APP_NAME,
      version: APP_VERSION,
      date: new Date().toISOString(),
      userAgent: navigator.userAgent,
      language: navigator.language,
      standalone,
      screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
      logs: this.logs.map(({ message, source, time, page, count }) => ({
        time: new Date(time).toISOString(),
        page,
        source,
        count,
        message,
      })),
    };
  }

  private persist() {
    try {
      const stored: StoredLog[] = this.logs.map(({ message, source, time, page, count }) => ({
        message,
        source,
        time,
        page,
        count,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // storage full or blocked: logs stay in memory only
    }
  }
}
export const logsStore = new LogsStore();
