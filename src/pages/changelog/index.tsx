import { SimpleMenu } from '$cmp/Layout/SimpleMenu'
import { MenuItem } from '$cmp/Miscellaneous/MenuItem'
import { FaGithub } from 'react-icons/fa'
import { ChangelogRow } from '$cmp/Changelog/ChangelogRow'
import { updates } from '$lib/updates'
import { APP_VERSION } from '$/Config'
import { Title } from '$cmp/Miscellaneous/Title'
import { DefaultPage } from '$cmp/Layout/DefaultPage'
import { AppButton } from '$/components/Inputs/AppButton'
import Link from 'next/link'

const cacheVersion = process.env.NEXT_PUBLIC_SW_VERSION
export default function Changelogpage() {
    return <DefaultPage excludeMenu={true}>
        <SimpleMenu>
            <MenuItem ariaLabel='Go to github'>
                <a href='https://github.com/Specy/genshin-music' className='icon' target="_blank" rel='noreferrer'>
                    <FaGithub />
                </a>
            </MenuItem>
        </SimpleMenu>
        <Title text={`Changelog V${APP_VERSION}`} description={`Changelog V${APP_VERSION}\n${updates[0]?.changes.join(";")}`} />
        <div className='changelog-page-title'>
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
        <div className='changelog-ending' />
    </DefaultPage>
}