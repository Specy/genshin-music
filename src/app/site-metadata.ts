import type {Metadata, Viewport} from 'next';

const appName = process.env.NEXT_PUBLIC_APP_NAME === 'Sky' ? 'Sky' : 'Genshin';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const isBeta = process.env.NEXT_PUBLIC_IS_BETA === 'true';

function assetPath(pathname: string): string {
    return basePath + pathname;
}

export const rootMetadata: Metadata = {
    title: appName + ' Music Nightly',
    description: appName === 'Sky'
        ? 'Sky music nightly, a website to play, practice and compose songs'
        : 'Genshin music, a website to play, practice and compose songs',
    icons: {
        icon: assetPath('/favicon.ico'),
        apple: assetPath('/logo192.png'),
    },
    manifest: assetPath('/manifest.json'),
    robots: isBeta ? {index: false, follow: false} : undefined,
};

export const rootViewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    minimumScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: '#63aea7',
};
