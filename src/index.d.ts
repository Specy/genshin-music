export {}
declare global {
    interface Window {
        launchQueue: {
            setConsumer: (callback: (launchParams: any) => void) => void;
        }
    }
}