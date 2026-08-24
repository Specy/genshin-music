// MOSTLY DORMANT. This store drove the home screen when it was a floating popup: `canShow` was the
// "auto-open on load" setting, `visible`/`isInPosition` were the overlay's open state and its
// close animation. Home is a page now (routes/+page.svelte -> HomePage.svelte), no reachable code
// calls open()/override() any more, and Home.svelte only mounts to stay revertible - see
// HomeContent.svelte's header for the step-by-step restore. (Grepping open() still turns up two
// hits: the `pageName === 'Home'` branches in Composer.svelte and routes/vsrg-composer - both
// already-dead code no caller reaches, left in place as part of the same dormant path.)
// `hasPersistentStorage` is the one field still live: AppInit.svelte seeds it and the first-visit
// welcome (HomeContent.svelte) reads it, on the page as much as in the popup.
type HomeStoreState = {
  canShow: boolean;
  visible: boolean;
  isInPosition: boolean;
  hasPersistentStorage: boolean;
};

class HomeStore {
  state: HomeStoreState = $state({
    canShow: false,
    visible: false,
    isInPosition: false,
    hasPersistentStorage: false,
  });

  open = () => {
    this.setState({ visible: true, isInPosition: false });
  };
  close = () => {
    this.setState({ isInPosition: true });
    setTimeout(() => {
      this.setState({ visible: false });
    }, 150);
  };
  override = (override: boolean) => {
    if (override) this.open();
    else this.close();
  };
  setState = (state: Partial<HomeStoreState>) => {
    Object.assign(this.state, state);
  };
}
export const homeStore = new HomeStore();
