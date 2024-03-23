class HistoryTracker {
    pages: String[] = [];

    get lastPage() {
        return this.pages[this.pages.length - 1]
    }

    get hasNavigated() {
        return this.pages.length > 0
    }

    addPage(page: String) {
        this.pages.push(page)
    }
}


export const historyTracker = new HistoryTracker();
