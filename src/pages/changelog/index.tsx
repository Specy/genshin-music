import {SimpleMenu} from '$cmp/shared/pagesLayout/SimpleMenu'
import {MenuButton} from '$cmp/shared/Menu/MenuItem'
import {FaGithub} from 'react-icons/fa'
import {ChangelogRow} from '$cmp/pages/Changelog/ChangelogRow'
import {CHANGELOG} from '$/changelog'
import {APP_VERSION, BASE_PATH} from '$config'
import {PageMetadata} from '$cmp/shared/Miscellaneous/PageMetadata'
import {DefaultPage} from '$cmp/shared/pagesLayout/DefaultPage'
import {AppButton} from '$cmp/shared/Inputs/AppButton'
import Link from 'next/link'
import s from './Changelog.module.css'
import {clearClientCache} from "$lib/utils/Utilities";
import {logger} from "$stores/LoggerStore";
import {useTranslation} from "react-i18next";
import {useSetPageVisited} from "$cmp/shared/PageVisit/pageVisit";

const cacheVersion = process.env.NEXT_PUBLIC_SW_VERSION
export default function ChangelogPage() {
    useSetPageVisited('changelog')
    const { t} = useTranslation(['changelog', 'cache', 'home'])
    function clearCache() {
        clearClientCache()
            .then(() => {
                logger.success(t('cache:clear_cache'))
                setTimeout(() => {
                    window.location.href = BASE_PATH || "/"
                }, 1000)
            })
            .catch((e) => {
                console.error(e)
                logger.error("cache:error_clearing_cache")
            })
    }

    return <DefaultPage
        excludeMenu={true}
        menu={
            <SimpleMenu>
                <Link href='https://github.com/Specy/genshin-music' target="_blank" rel='noreferrer'
                      title='Go to github'>
                    <MenuButton ariaLabel='Go to github'>
                        <FaGithub className='icon'/>
                    </MenuButton>
                </Link>
            </SimpleMenu>
        }
    >
        <PageMetadata text={`${t('home:changelog_name')} V${APP_VERSION}`}
                      description={`Changelog V${APP_VERSION}\n${CHANGELOG[0]?.changes.join(";")}`}/>
        <div className={s['changelog-page-title']}>
            {t('home:changelog_name')}
            <span style={{fontSize: '1.2rem', marginLeft: '1rem'}}>
                v{APP_VERSION}
            </span>
        </div>
        <div className='row' style={{fontSize: '0.8rem', justifyContent: 'space-between', alignItems: 'center'}}>
            {t('cache:cache')}: {cacheVersion || 'DEV'}
            <AppButton onClick={clearCache}>
                {t('cache:clear_cache')}
            </AppButton>
            <Link href='/error'>
                <AppButton>
                    {t('view_error_logs')}
                </AppButton>
            </Link>
        </div>
        <div style={{marginTop: '2rem'}}/>

        {CHANGELOG.map(data => <ChangelogRow
            {...data}
            key={data.version}
        />)}
        <div className={s['changelog-ending']}/>
    </DefaultPage>
}