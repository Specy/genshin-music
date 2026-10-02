// Calling prompt()/confirm()/select() again while one is already pending first resolves the
// pending promise with null (supersede-cancel), then installs the new
// question/cancellable/deferred.

export type AsyncPromptState = {
  question: string;
  cancellable: boolean;
  deferred: ((value: string | null) => void) | null;
};
export type AsyncConfirmState = {
  question: string;
  cancellable: boolean;
  deferred: ((value: boolean | null) => void) | null;
};
export type AsyncSelectOption<T> = {
  value: T;
  text: string;
  description?: string;
  disabled?: boolean;
};
export type AsyncSelectState = {
  question: string;
  cancellable: boolean;
  /**
   * THE BOUNDARY. A `$state` field cannot carry the caller's type parameter, so the pending
   * options are held here with `unknown` values and the generic `select()` below does the
   * narrowing. Nothing on this side ever interprets a value: the dialog renders `text` /
   * `description` / `disabled` and answers with the very value it was handed, which `select()`
   * looks back up among the options that one call supplied — so the T that comes out is the T
   * that went in, by position, with no assertion anywhere.
   */
  options: AsyncSelectOption<unknown>[];
  deferred: ((value: unknown) => void) | null;
};

class AsyncPromptStore {
  promptState: AsyncPromptState = $state({
    question: '',
    cancellable: true,
    deferred: null,
  });
  confirmState: AsyncConfirmState = $state({
    question: '',
    cancellable: true,
    deferred: null,
  });
  selectState: AsyncSelectState = $state({
    question: '',
    cancellable: true,
    options: [],
    deferred: null,
  });

  prompt = (question: string, cancellable = true) => {
    if (this.promptState.deferred) this.promptState.deferred(null);
    return new Promise<string | null>((res) => {
      Object.assign(this.promptState, {
        question,
        cancellable,
        deferred: res,
      });
    });
  };

  answerPrompt = (answer: string | null) => {
    if (this.promptState.deferred) {
      this.promptState.deferred(answer);
    } else {
      console.warn('No deferred prompt');
    }
    this.promptState.deferred = null;
  };

  confirm = (question: string, cancellable = true) => {
    if (this.confirmState.deferred) this.confirmState.deferred(null);
    return new Promise<boolean | null>((res) => {
      Object.assign(this.confirmState, {
        question,
        cancellable,
        deferred: res,
      });
    });
  };

  answerConfirm = (answer: boolean | null) => {
    if (this.confirmState.deferred) {
      this.confirmState.deferred(answer);
    } else {
      console.warn('No deferred confirm');
    }
    this.confirmState.deferred = null;
  };

  select = <T>(question: string, options: AsyncSelectOption<T>[], cancellable = true) => {
    if (this.selectState.deferred) this.selectState.deferred(null);
    return new Promise<T | null>((res) => {
      Object.assign(this.selectState, {
        question,
        cancellable,
        options,
        // The narrowing the state's boundary note describes. The lookup runs over the STATE's
        // options rather than the array captured here, so it compares what the dialog actually
        // read against what the dialog answered with — `$state` deep-proxies whatever it stores,
        // and an object-valued option read back out is a proxy, never the caller's own reference.
        // The value handed back then comes from the captured, typed array at the same position,
        // so it is a T without being asserted to be one. A miss — a cancel's null included —
        // answers null.
        deferred: (answer: unknown) => {
          const index = this.selectState.options.findIndex((option) => option.value === answer);
          res(index === -1 ? null : options[index].value);
        },
      });
    });
  };

  answerSelect = (answer: unknown) => {
    if (this.selectState.deferred) {
      this.selectState.deferred(answer);
    } else {
      console.warn('No deferred select');
    }
    this.selectState.deferred = null;
  };

  clearAll = () => {
    if (this.promptState.deferred) this.promptState.deferred(null);
    if (this.confirmState.deferred) this.confirmState.deferred(null);
    if (this.selectState.deferred) this.selectState.deferred(null);
  };
}

export const asyncPromptStore = new AsyncPromptStore();

export async function asyncPrompt(question: string): Promise<string | null> {
  return asyncPromptStore.prompt(question);
}

export async function asyncConfirm(question: string, cancellable = true): Promise<boolean | null> {
  return asyncPromptStore.confirm(question, cancellable);
}

export async function asyncSelect<T>(
  question: string,
  options: AsyncSelectOption<T>[],
  cancellable = true
): Promise<T | null> {
  return asyncPromptStore.select(question, options, cancellable);
}
