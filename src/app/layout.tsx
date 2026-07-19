import type {ReactNode} from 'react';
import {GoogleAnalyticsScript} from '$cmp/GoogleAnalyticsScript';
import Providers from './providers';
import {rootMetadata, rootViewport} from './site-metadata';
import './_client-pages/App.css';
import '$cmp/pages/Index/Home.css';
import './_client-pages/Utility.scss';
import '$cmp/pages/Player/Keyboard.css';
import '$cmp/pages/Player/menu.css';
import './_client-pages/composer/Composer.css';
import './_client-pages/theme/Theme.css';
import './_client-pages/vsrg-composer/VsrgComposer.css';
import './_client-pages/sheet-visualizer/SheetVisualizer.css';

export const metadata = rootMetadata;
export const viewport = rootViewport;

type RootLayoutProps = Readonly<{
    children: ReactNode;
}>;

export default function RootLayout({children}: RootLayoutProps) {
    return <html lang="en">
        <body>
            <GoogleAnalyticsScript/>
            <Providers>{children}</Providers>
        </body>
    </html>;
}
