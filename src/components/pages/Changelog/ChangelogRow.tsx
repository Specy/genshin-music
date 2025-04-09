import s from "$pages/changelog/Changelog.module.css"
import {useMemo} from "react";
import {useTranslation} from "react-i18next";

interface ChangelogRowProps {
    version: string | number,
    changes: string[]
    date: Date
}

export function ChangelogRow({version, date, changes: _changes}: ChangelogRowProps) {
    const {t} = useTranslation('versions')
    const v = `${version}`.replaceAll('.', '-')
    //@ts-ignore
    const title = t(`${v}.title`) as string

    const changes = _changes.map((_, i) => {
        //@ts-ignore
        return t(`${v}.change-${i + 1}`) as string
    })

    const localDate = useMemo(() => {
        return new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(date)
    }, [date])
    return <div>
        <div className={s['changelog-title']}>
            <div className={s['clt-1']}>
                {version}
            </div>
            <div className={s['clt-2']} suppressHydrationWarning={true}>
                {localDate}
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