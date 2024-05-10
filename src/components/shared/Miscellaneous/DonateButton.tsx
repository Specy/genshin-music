import {isTWA} from '$lib/utils/Utilities'
import Link from 'next/link'
import {useEffect, useState} from 'react'
import {useTranslation} from "react-i18next";

export default function DonateButton({style}: { style?: React.CSSProperties }) {
    const {t} = useTranslation('common')
    const [isTwa, setIsTwa] = useState(false)
    useEffect(() => {
        setIsTwa(isTWA())
    }, [])


    return !isTwa ? <Link className="donate-button" href='/donate' style={style}>
        {t('donate')}
    </Link> : <></>
}