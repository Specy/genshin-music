'use client';

import {useEffect} from 'react';

type GlobalErrorProps = {
    error: Error;
    unstable_retry: () => void;
};

export default function GlobalError({error, unstable_retry}: GlobalErrorProps) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return <html lang="en">
        <body>
            <main>
                <h1>Something went wrong</h1>
                <p>The application could not load. You can try again.</p>
                <button type="button" onClick={unstable_retry}>Try again</button>
            </main>
        </body>
    </html>;
}
