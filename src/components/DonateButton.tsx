import { isTwa } from 'appConfig'
//@ts-ignore
import { Link } from 'react-router-dom'
export default function DonateButton(){
    return isTwa() && <Link className="donate-button" to={'Donate'}>
        Donate
    </Link>
}