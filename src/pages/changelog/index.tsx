import {SimpleMenu} from '$cmp/shared/pagesLayout/SimpleMenu'
import {MenuItem} from '$cmp/shared/Miscellaneous/MenuItem'
import {FaGithub} from 'react-icons/fa'
import {ChangelogRow} from '$cmp/pages/Changelog/ChangelogRow'
import {updates} from '$lib/updates'
import {APP_VERSION, BASE_PATH} from '$config'
import {PageMeta} from '$cmp/shared/Miscellaneous/PageMeta'
import {DefaultPage} from '$cmp/shared/pagesLayout/DefaultPage'
import {AppButton} from '$cmp/shared/Inputs/AppButton'
import Link from 'next/link'
import s from './Changelog.module.css'
import {clearClientCache} from "$lib/Utilities";
import {logger} from "$stores/LoggerStore";

const cacheVersion = process.env.NEXT_PUBLIC_SW_VERSION
export default function ChangelogPage() {

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

    return <DefaultPage
        excludeMenu={true}
        menu={
            <SimpleMenu>
                <Link href='https://github.com/Specy/genshin-music' target="_blank" rel='noreferrer'
                      title='Go to github'>
                    <MenuItem ariaLabel='Go to github'>
                        <FaGithub className='icon'/>
                    </MenuItem>
                </Link>
            </SimpleMenu>
        }
    >
        <PageMeta text={`Changelog V${APP_VERSION}`}
                  description={`Changelog V${APP_VERSION}\n${updates[0]?.changes.join(";")}`}/>
        <div className={s['changelog-page-title']}>
            Changelog
            <span style={{fontSize: '1.2rem', marginLeft: '1rem'}}>
                v{APP_VERSION}
            </span>
        </div>
        <div className='row' style={{fontSize: '0.8rem', justifyContent: 'space-between', alignItems: 'center'}}>
            Cache: {cacheVersion || 'DEV'}
            <AppButton onClick={clearCache}>
                Clear Cache
            </AppButton>
            <Link href='/error'>
                <AppButton>
                    View Error logs
                </AppButton>
            </Link>
        </div>
        <div style={{marginTop: '2rem'}}/>

        {updates.map(data => <ChangelogRow
            {...data}
            key={data.version}
        />)}
        <div className={s['changelog-ending']}/>
    </DefaultPage>
}