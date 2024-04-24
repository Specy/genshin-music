import {isTWA} from '$lib/utils/Utilities'
import Link from 'next/link'
import {useEffect, useState} from 'react'

export default function DonateButton({style}: { style?: React.CSSProperties }) {
    const [isTwa, setIsTwa] = useState(false)
    useEffect(() => {
        setIsTwa(isTWA())
    }, [])


    return !isTwa ? <Link className="donate-button" href='/donate' style={style}>
        Donate
    </Link> : <></>
}