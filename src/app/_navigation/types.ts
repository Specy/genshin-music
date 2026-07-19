export type NavigationTarget = string | '__back__';

export type LeaveHandler = (target: NavigationTarget) => Promise<boolean>;

export type NavigationOptions = {
    scroll?: boolean;
    bypassLeaveHandler?: boolean;
};

export type AppNavigation = {
    push: (href: string, options?: NavigationOptions) => Promise<boolean>;
    replace: (href: string, options?: NavigationOptions) => Promise<boolean>;
    back: () => Promise<boolean>;
    pushWithoutGuard: (
        href: string,
        options?: Omit<NavigationOptions, 'bypassLeaveHandler'>,
    ) => void;
    registerLeaveHandler: (handler: LeaveHandler) => () => void;
};
