import {Head, Html, Main, NextScript} from 'next/document';
import {IS_BETA} from "$config";

export default function Document() {
    return (
        <Html lang='en'>
            <Head>
                {IS_BETA && <meta name={'robots'} content={'noindex'}/>}
            </Head>
            <body>
            <Main/>
            <NextScript/>
            </body>
        </Html>
    );
}