'use client';

import {createContext, type ReactNode, useCallback, useContext, useMemo, useRef} from 'react';
import {useRouter} from 'next/navigation';
import {LeaveGuard} from './leaveGuard';
import type {AppNavigation, LeaveHandler, NavigationOptions} from './types';

type NavigationProviderProps = {
    children: ReactNode;
};

const NavigationContext = createContext<AppNavigation | null>(null);

export function NavigationProvider({children}: NavigationProviderProps) {
    const router = useRouter();
    const guardRef = useRef<LeaveGuard | null>(null);
    if (guardRef.current === null) guardRef.current = new LeaveGuard();
    const guard = guardRef.current;

    const push = useCallback(async (href: string, options: NavigationOptions = {}): Promise<boolean> => {
        const mayNavigate = options.bypassLeaveHandler || await guard.canLeave(href);
        if (!mayNavigate) return false;
        router.push(href, {scroll: options.scroll});
        return true;
    }, [guard, router]);

    const replace = useCallback(async (href: string, options: NavigationOptions = {}): Promise<boolean> => {
        const mayNavigate = options.bypassLeaveHandler || await guard.canLeave(href);
        if (!mayNavigate) return false;
        router.replace(href, {scroll: options.scroll});
        return true;
    }, [guard, router]);

    const back = useCallback(async (): Promise<boolean> => {
        if (!await guard.canLeave('__back__')) return false;
        router.back();
        return true;
    }, [guard, router]);

    const pushWithoutGuard = useCallback((
        href: string,
        options: Omit<NavigationOptions, 'bypassLeaveHandler'> = {},
    ): void => {
        router.push(href, {scroll: options.scroll});
    }, [router]);

    const registerLeaveHandler = useCallback((handler: LeaveHandler): (() => void) => {
        return guard.register(handler);
    }, [guard]);

    const navigation = useMemo<AppNavigation>(() => ({
        push,
        replace,
        back,
        pushWithoutGuard,
        registerLeaveHandler,
    }), [back, push, pushWithoutGuard, registerLeaveHandler, replace]);

    return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
}

export function useAppNavigation(): AppNavigation {
    const navigation = useContext(NavigationContext);
    if (navigation === null) throw new Error('useAppNavigation must be used inside NavigationProvider.');
    return navigation;
}
