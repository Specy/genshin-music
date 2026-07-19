'use client';

import type {ReactNode} from 'react';
import {AppBackground} from '$cmp/shared/pagesLayout/AppBackground';

type PageBackgroundProps = {
    children: ReactNode;
    page: 'Composer' | 'Main';
};

export function PageBackground({children, page}: PageBackgroundProps) {
    return <AppBackground page={page}>{children}</AppBackground>;
}
