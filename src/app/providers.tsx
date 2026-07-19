'use client';

import type {ReactNode} from 'react';
import {useEffect} from 'react';
import {DropZoneProviderWrapper} from '$cmp/shared/ProviderWrappers/DropZoneProviderWrapper';
import {GeneralProvidersWrapper} from '$cmp/shared/ProviderWrappers/GeneralProvidersWrapper';
import {ThemeProviderWrapper} from '$cmp/shared/ProviderWrappers/ThemeProviderWrapper';
import AppBase from '$cmp/AppBase';
import {delay, setIfInTWA} from '$lib/utils/Utilities';
import * as serviceWorker from '$/serviceWorkerRegistration';
import {APP_NAME, IS_TAURI} from '$config';
import ErrorBoundaryRedirect from '$cmp/shared/Utility/ErrorBoundaryRedirect';
import {logger} from '$stores/LoggerStore';
import {logsStore} from '$stores/LogsStore';
import {asyncConfirm} from '$cmp/shared/Utility/AsyncPrompts';
import {i18n} from '$i18n/i18n';
import {NavigationProvider} from './_navigation/NavigationProvider';

type ProvidersProps = {
    children: ReactNode;
};

type VirtualKeyboard = {
    overlaysContent: boolean;
};

function getVirtualKeyboard(): VirtualKeyboard | undefined {
    return (navigator as Navigator & {virtualKeyboard?: VirtualKeyboard}).virtualKeyboard;
}

export default function Providers({children}: ProvidersProps) {
    useEffect(() => {
        if (window.location.hostname === 'localhost') return;
        const originalErrorLog = console.error.bind(console);
        console.error = (...args: unknown[]) => {
            try {
                originalErrorLog(...args);
                logsStore.addLog({
                    error: args.find((arg): arg is Error => arg instanceof Error),
                    message: args.map((arg) => {
                        if (arg instanceof Error) return arg.stack ?? arg.message;
                        return typeof arg === 'object' ? JSON.stringify(arg, null, 4) : String(arg);
                    }).join(' '),
                });
            } catch (error) {
                originalErrorLog('Error logging error', error);
            }
        };
        return () => {
            console.error = originalErrorLog;
        };
    }, []);

    useEffect(() => {
        const windowInterceptor = (event: ErrorEvent) => {
            const error = event.error instanceof Error ? event.error : undefined;
            logsStore.addLog({
                error,
                message: error?.stack ?? error?.message ?? event.message,
            });
        };

        window.addEventListener('error', windowInterceptor);
        return () => {
            window.removeEventListener('error', windowInterceptor);
        };
    }, []);

    useEffect(() => {
        async function registerServiceWorker() {
            try {
                const virtualKeyboard = getVirtualKeyboard();
                if (virtualKeyboard) {
                    virtualKeyboard.overlaysContent = true;
                    console.warn('virtual keyboard supported');
                } else {
                    console.warn('virtual keyboard not supported');
                }
                if (!IS_TAURI) {
                    setIfInTWA();
                    console.log('Registering service worker');
                    await serviceWorker.register({
                        onUpdate: async (registration) => {
                            await delay(3000);
                            const shouldUpdate = await asyncConfirm(i18n.t('logs:update_available'), false);
                            if (!shouldUpdate) return;
                            registration.waiting?.postMessage({type: 'SKIP_WAITING'});
                            localStorage.setItem(APP_NAME + '_repeat_update_notice', 'true');
                            await delay(1000);
                            window.location.reload();
                        },
                    });
                }
            } catch (error) {
                console.error(error);
            }
        }

        console.log('Checking for changelog...');
        void registerServiceWorker();
    }, []);

    return <ThemeProviderWrapper>
        <DropZoneProviderWrapper>
            <GeneralProvidersWrapper>
                <NavigationProvider>
                    <ErrorBoundaryRedirect
                        onErrorGoTo="/error"
                        onError={() => logger.error(i18n.t('logs:error_with_the_app'))}
                    >
                        <>
                            <AppBase/>
                            {children}
                        </>
                    </ErrorBoundaryRedirect>
                </NavigationProvider>
            </GeneralProvidersWrapper>
        </DropZoneProviderWrapper>
    </ThemeProviderWrapper>;
}
