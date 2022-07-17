import { DefaultPage } from "components/Layout/DefaultPage";
import { Title } from "components/Miscellaneous/Title";
import { Link } from 'react-router-dom'
export default function Error404() {
    return <DefaultPage>
        <Title text="404" />
        <Link to='./' className='link' style={{textAlign: 'center'}}>
            <div style={{ fontSize: '6rem' }}>
                404
            </div>
            <div>
                No page found, open the menu to change page
            </div>
        </Link>
    </DefaultPage>
}