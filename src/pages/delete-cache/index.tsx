import {useEffect} from "react";
import {clearClientCache} from "$lib/Utilities";
import {logger} from "$stores/LoggerStore";
import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {Header} from "$cmp/shared/header/Header";
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {Column} from "$cmp/shared/layout/Column";
import {BASE_PATH} from "$config";


export default function ResetCachePage() {
    useEffect(() => {
        async function run() {
            try {
                if (await clearClientCache()) {
                    logger.success("Cache Cleared")
                    setTimeout(() => {
                        window.location.href = BASE_PATH || "/" //important, "" causes a reload loop
                    }, 1000)
                }
            } catch (e) {
                console.error(e)
                logger.error("Error clearing cache")
            }
        }

        run()
    }, []);

    function clearCache() {
        clearClientCache()
            .then(() => {
                logger.success("Cache Cleared")
                setTimeout(() => {
                    window.location.href = BASE_PATH || "/"
                }, 1000)
            })
            .catch((e) => {
                console.error(e)
                logger.error("Error clearing cache")
            })
    }

    return <DefaultPage>
        <Column gap={'1rem'}>
            <Header>
                Reset cache
            </Header>
            <div>
                This page will clear the cache of the application. This will remove all cached data and reload the page.
                It will not
                delete your songs or data, only the cached assets. As soon as you visit this page, it will clear the
                cache automatically.
                You can also click the button below to clear the cache manually.
            </div>
            <AppButton onClick={clearCache}>
                Clear Cache
            </AppButton>
        </Column>
    </DefaultPage>
}