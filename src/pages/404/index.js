import { SimpleMenu } from "components/SimpleMenu";
import { Link } from 'react-router-dom'
export default function Error404() {
    return <div className="default-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <SimpleMenu />
        <Link to='./' className='link' style={{textAlign: 'center'}}>
            <div style={{ fontSize: '6rem' }}>
                404
            </div>
            <div>
                No page found, open the menu to change page
            </div>
        </Link>
    </div>
}