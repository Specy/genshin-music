import {useEffect} from "react";
import {clearClientCache} from "$lib/utils/Utilities";
import {logger} from "$stores/LoggerStore";
import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {Header} from "$cmp/shared/header/Header";
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {Column} from "$cmp/shared/layout/Column";
import {BASE_PATH} from "$config";
import {useTranslation} from "react-i18next";
import {useSetPageVisited} from "$cmp/shared/PageVisit/pageVisit";


export default function ResetCachePage() {
    useSetPageVisited('deleteCache')
    const {t} = useTranslation(['cache', 'home'])
    useEffect(() => {
        async function run() {
            try {
                if (await clearClientCache()) {
                    logger.success(t('home:cache_cleared'))
                    setTimeout(() => {
                        window.location.href = BASE_PATH || "/" //important, "" causes a reload loop
                    }, 1000)
                }
            } catch (e) {
                console.error(e)
                logger.error(t('home:error_clearing_cache'))
            }
        }

        run()
    }, []);

    function clearCache() {
        clearClientCache()
            .then(() => {
                logger.success('home:cache_cleared')
                setTimeout(() => {
                    window.location.href = BASE_PATH || "/"
                }, 1000)
            })
            .catch((e) => {
                console.error(e)
                logger.error('home:error_clearing_cache')
            })
    }

    return <DefaultPage>
        <Column gap={'1rem'}>
            <Header>
                {t('reset_cache')}
            </Header>
            <div>
                {t('reset_cache_message')}
            </div>
            <AppButton onClick={clearCache}>
                {t('clear_cache')}
            </AppButton>
        </Column>
    </DefaultPage>
}