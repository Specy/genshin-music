import { isTWA } from '$lib/Utilities'
import Link from 'next/link'
import { useEffect, useState } from 'react'
export default function DonateButton(){
    const [isTwa, setIsTwa] = useState(false)
    useEffect(() => {
        setIsTwa(isTWA())
    }, [])


    return !isTwa ? <Link className="donate-button" href='donate'>
        Donate
    </Link> : <></>
}