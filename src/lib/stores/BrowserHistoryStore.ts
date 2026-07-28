class HistoryTracker {
  pages: string[] = [];

  get lastPage() {
    return this.pages[this.pages.length - 1];
  }

  get hasNavigated() {
    return this.pages.length > 0;
  }

  addPage(page: string) {
    this.pages.push(page);
  }
}

export const browserHistoryStore = new HistoryTracker();
