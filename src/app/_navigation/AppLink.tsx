'use client';

import NextLink from 'next/link';
import type {ComponentProps} from 'react';
import {useAppNavigation} from './NavigationProvider';

type NextLinkProps = ComponentProps<typeof NextLink>;
type OnNavigate = NonNullable<NextLinkProps['onNavigate']>;

export type AppLinkProps = Omit<NextLinkProps, 'href' | 'onNavigate'> & {
    href: string;
    onNavigate?: OnNavigate;
};

export function AppLink({href, onNavigate, replace, scroll, ...props}: AppLinkProps) {
    const navigation = useAppNavigation();

    const handleNavigate: OnNavigate = (event) => {
        event.preventDefault();
        onNavigate?.(event);
        const navigate = replace ? navigation.replace : navigation.push;
        void navigate(href, {scroll});
    };

    return <NextLink {...props} href={href} replace={replace} scroll={scroll} onNavigate={handleNavigate}/>;
}
