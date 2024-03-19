import { SimpleMenu } from '$cmp/Layout/SimpleMenu'
import { MenuItem } from '$cmp/Miscellaneous/MenuItem'
import { FaGithub } from 'react-icons/fa'
import { ChangelogRow } from '$cmp/Changelog/ChangelogRow'
import { updates } from '$lib/updates'
import { APP_VERSION } from '$config'
import { PageMeta } from '$cmp/Miscellaneous/PageMeta'
import { DefaultPage } from '$cmp/Layout/DefaultPage'
import { AppButton } from '$cmp/Inputs/AppButton'
import Link from 'next/link'
import s from './Changelog.module.css'
const cacheVersion = process.env.NEXT_PUBLIC_SW_VERSION
export default function ChangelogPage() {
    return <DefaultPage
        excludeMenu={true}
        menu={
            <SimpleMenu>
                <Link href='https://github.com/Specy/genshin-music' target="_blank" rel='noreferrer' title='Go to github'>
                    <MenuItem ariaLabel='Go to github'>
                        <FaGithub  className='icon'/>
                    </MenuItem>
                </Link>
            </SimpleMenu>
        }
    >
        <PageMeta text={`Changelog V${APP_VERSION}`} description={`Changelog V${APP_VERSION}\n${updates[0]?.changes.join(";")}`} />
        <div className={s['changelog-page-title']}>
            Changelog
            <span style={{ fontSize: '1.2rem', marginLeft: '1rem' }}>
                v{APP_VERSION}
            </span>
        </div>
        <div className='row' style={{ fontSize: '0.8rem', justifyContent: 'space-between', alignItems: 'center' }}>
            Cache: {cacheVersion || 'DEV'}
            <Link href='error'>
                <AppButton>
                    View Error logs
                </AppButton>
            </Link>
        </div>
        <div style={{ marginTop: '2rem' }} />

        {updates.map(data => <ChangelogRow
            {...data}
            key={data.version}
        />)}
        <div className={s['changelog-ending']} />
    </DefaultPage>
}