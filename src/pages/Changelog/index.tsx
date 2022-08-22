import { SimpleMenu } from '$cmp/Layout/SimpleMenu'
import { MenuItem } from '$cmp/Miscellaneous/MenuItem'
import { FaGithub } from 'react-icons/fa'
import { ChangelogRow } from './ChangelogRow'
import './Changelog.css'
import { updates } from './updates'
import { APP_VERSION } from '$/appConfig'
import { Title } from '$cmp/Miscellaneous/Title'
import { DefaultPage } from '$cmp/Layout/DefaultPage'

const cacheVersion = import.meta.env.VITE_SW_VERSION
export default function Changelogpage() {
    return <DefaultPage excludeMenu={true}>
        <SimpleMenu>
            <MenuItem ariaLabel='Go to github'>
                <a href='https://github.com/Specy/genshin-music' className='icon' target="_blank" rel='noreferrer'>
                    <FaGithub />
                </a>
            </MenuItem>
        </SimpleMenu>
        <Title text={`Changelog V${APP_VERSION}`} />

        <div className='changelog-page-title'>
            Changelog
            <span style={{ fontSize: '1.2rem', marginLeft: '1rem' }}>
                v{APP_VERSION}
            </span>
        </div>
        <div style={{ fontSize: '0.8rem' }}>
            Cache: {cacheVersion || 'DEV'}
        </div>
        <div style={{ marginTop: '2rem' }} />

        {updates.map(data => <ChangelogRow
            {...data}
            key={data.version}
        />)}
        <div className='changelog-ending' />
    </DefaultPage>
}