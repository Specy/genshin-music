import { isMobile } from 'is-mobile';

type GlobalConfigStoreState = {
  PLAY_BAR_OFFSET: number;
  IS_MOBILE: boolean;
  IS_MIDI_AVAILABLE: boolean;
};

class GlobalConfigStore {
  state: GlobalConfigStoreState = $state({
    PLAY_BAR_OFFSET: 200,
    IS_MOBILE: false,
    IS_MIDI_AVAILABLE: true,
  });

  setState = (state: Partial<GlobalConfigStoreState>) => {
    Object.assign(this.state, state);
  };
  load = () => {
    if (typeof window === 'undefined') return;
    const IS_MOBILE = isMobile();
    this.setState({
      IS_MOBILE,
      PLAY_BAR_OFFSET: IS_MOBILE ? 100 : 200,
      IS_MIDI_AVAILABLE: 'requestMIDIAccess' in navigator,
    });
  };
  get = () => {
    return { ...this.state };
  };
}
export const globalConfigStore = new GlobalConfigStore();
