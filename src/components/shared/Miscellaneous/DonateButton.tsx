import {isTWA} from '$lib/utils/Utilities'
import Link from 'next/link'
import {useEffect, useState} from 'react'
import {useTranslation} from "react-i18next";
import s from './donateButton.module.scss'
import {DonateIcon} from "$cmp/shared/Miscellaneous/DonateIcon";
export default function DonateButton({style}: { style?: React.CSSProperties }) {
    const {t} = useTranslation('common')
    const [isTwa, setIsTwa] = useState(false)
    useEffect(() => {
        setIsTwa(isTWA())
    }, [])


    return !isTwa ? <Link className={s['donate-button']} href='/donate' style={style}>
         <DonateIcon
            style={{
                fontSize: "1.5rem",
                marginLeft: '-1.5rem'
            }}
         />
       {t('donate')}
    </Link> : <></>
}
