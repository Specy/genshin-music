import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {PageMetadata} from "$cmp/shared/Miscellaneous/PageMetadata";
import Link from 'next/link'
import {useTranslation} from "react-i18next";

export default function Error404() {
    const {t} = useTranslation('page404')
    return <DefaultPage>
        <PageMetadata text="404" description="oh no!"/>
        <Link href='/' className='link' style={{textAlign: 'center'}}>
            <div style={{fontSize: '6rem'}}>
                404
            </div>
            <div>
                {t('page_not_found')}
            </div>
        </Link>
    </DefaultPage>
}