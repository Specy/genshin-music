import s from "$pages/changelog/Changelog.module.css"

interface ChangelogRowProps{
    version: string  | number,
    title: string, 
    changes: string[],
    date: string
}

export function ChangelogRow({version, title, changes, date }:ChangelogRowProps) {
    return <div>
        <div className={s['changelog-title']}>
            <div className={s['clt-1']}>
                {version}
            </div>
            <div className={s['clt-2']}>
                {date}
            </div>
        </div>
        <div className={s['changelog-list']}>
            <div className={s['cll-1']}>
                {title}
            </div>
            <ul>
                {changes.map((e, i) =>
                    <li key={i}>
                        {e.split('$l').map((item, i) => {
                            if (i === 0) {
                                return <div key={i}>{item}</div>
                            }
                            return <p key={i} className={s['cll-new-line']}>
                                {item}
                            </p>
                        })}
                    </li>
                )}
            </ul>
        </div>
    </div>
}