import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {PageMeta} from "$cmp/shared/Miscellaneous/PageMeta";
import Link from 'next/link'

export default function Error404() {
    return <DefaultPage>
        <PageMeta text="404" description="oh no!"/>
        <Link href='/' className='link' style={{textAlign: 'center'}}>
            <div style={{fontSize: '6rem'}}>
                404
            </div>
            <div>
                The page was not found, click here to go back to the home page
            </div>
        </Link>
    </DefaultPage>
}