import { SimpleMenu } from 'components/SimpleMenu'
import MenuItem from 'components/MenuItem'
import { FaGithub } from 'react-icons/fa'
import { ChangelogRow } from './ChangelogRow'
import './Changelog.css'
import { updates } from './updates'

export default function Changelogpage() {
    return <div className='default-page'>
        <div className='changelog-page-title'>
            Changelog
        </div>
        <SimpleMenu>
            <MenuItem>
                <a href='https://github.com/Specy/genshin-music' className='icon' target="_blank" rel='noreferrer'>
                    <FaGithub />
                </a>
            </MenuItem>
        </SimpleMenu>
        
        {updates.map(data => <ChangelogRow
            {...data}
            key={data.version}
        />)}
        <div className='changelog-ending' />
    </div>
}