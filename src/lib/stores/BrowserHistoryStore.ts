class HistoryTracker {
  pages: string[] = [];

  /**
   * True from the moment the session's FIRST navigation finishes - the `enter` one that produced
   * whatever page the user landed on, whether that was '/' or a deep link.
   *
   * A component reading this DURING ITS OWN INIT therefore learns how it was reached: SvelteKit
   * runs every `afterNavigate` callback only after the new page's components have been created,
   * so while a page is initialising this flag still describes the navigation BEFORE it. False =
   * this component is part of the initial page load; true = it was created by a later in-app
   * navigation. HomePage.svelte keys its entry animation off exactly that.
   *
   * Not the same question as `hasNavigated`, which is one navigation behind again (a page is only
   * pushed once the first one has settled) - land on /player, click home, and `hasNavigated` is
   * still false while this is already true.
   */
  hasSettledFirstNavigation = false;

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
