import { AppError } from '$core/Errors';

export enum LoggerStatus {
  ERROR = 'var(--red)',
  WARN = 'var(--orange)',
  SUCCESS = 'var(--accent)',
}

export type ToastState = {
  timestamp: number;
  visible: boolean;
  text: string;
  timeout: number;
  id: number;
  type: LoggerStatus;
};
export type PillAction = { text: string; onClick: () => void };
export type PillState = {
  visible: boolean;
  text: string;
  spinner: boolean;
  actions: PillAction[];
};
export type ShowPillOptions = { spinner?: boolean; actions?: PillAction[] };

class LoggerStore {
  toasts: ToastState[] = $state([]);
  pillState: PillState = $state({ visible: false, text: '', spinner: false, actions: [] });
  private lastId = 0;

  log = (text: string, timeout: number = 4500, type: LoggerStatus = LoggerStatus.SUCCESS) => {
    const id = ++this.lastId;
    this.toasts.push({
      text,
      timestamp: Date.now(),
      timeout,
      visible: true,
      id,
      type,
    });
    setTimeout(() => this.hideToast(id), timeout);
    setTimeout(() => this.removeToast(id), timeout + 300);
  };
  error = (text: string, timeout?: number) => {
    this.log(text, timeout, LoggerStatus.ERROR);
  };
  logAppError = (error: Error) => {
    if (error instanceof AppError) {
      this.error(error.message);
    } else {
      console.error(error);
    }
  };
  success = (text: string, timeout?: number) => {
    this.log(text, timeout, LoggerStatus.SUCCESS);
  };
  warn = (text: string, timeout?: number) => {
    this.log(text, timeout, LoggerStatus.WARN);
  };
  clearToasts = () => {
    this.toasts.splice(0, this.toasts.length);
  };
  hideToast = (id: number) => {
    this.setState(id, { visible: false });
  };
  removeToast = (id: number) => {
    this.toasts.splice(0, this.toasts.length, ...this.toasts.filter((t) => t.id !== id));
  };
  setState = (id: number, state: Partial<ToastState>) => {
    const toast = this.toasts.find((t) => t.id === id);
    if (toast) {
      Object.assign(toast, state);
    }
  };
  setPillState = (state: Partial<PillState>) => {
    Object.assign(this.pillState, state);
  };
  showPill = (text?: string, options?: ShowPillOptions) => {
    this.setPillState({
      text,
      visible: true,
      // Spinner and actions are reset to their defaults when the options omit them: the store is
      // a singleton and pills are shown from many unrelated call sites, so a stale Cancel button
      // from one caller must never survive onto the next caller's pill.
      spinner: options?.spinner ?? false,
      actions: options?.actions ?? [],
    });
  };
  hidePill = () => {
    // Visibility only: the pill fades out, so its contents have to stay put until the transition
    // ends. Clearing them here would blank the pill mid-fade; showPill resets them on the way in.
    this.setPillState({ visible: false });
  };
}
export const logger = new LoggerStore();
