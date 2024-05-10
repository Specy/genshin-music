import paypalImg from '$/assets/images/paypalme.png'
import kofiImg from '$/assets/images/kofi.png'
import {PageMetadata} from '$cmp/shared/Miscellaneous/PageMetadata'
import {DefaultPage} from '$cmp/shared/pagesLayout/DefaultPage'
import Image from 'next/image'
import s from './Donate.module.css'
import {APP_NAME} from '$config'
import {useTranslation} from "react-i18next";

export default function Donate() {
    const { t} = useTranslation(['donate', 'home'])
    return <DefaultPage>
        <PageMetadata text={t('home:donate_name')} description={`Help the development of ${APP_NAME.toLowerCase()} with a donation.`}/>
        <div className={s['donate-text']}>
            {t('donate_message')}
        </div>
        <div className={s['donation-wrapper']}>
            <a href="https://paypal.me/specyDev" target="_blank" className={s.paypal} rel="noreferrer">
                <Image
                    src={paypalImg}
                    alt='paypalme'
                    loading='lazy'
                    style={{height: "3rem", width: "auto"}}
                />
            </a>
            <a href="https://ko-fi.com/specy" target="_blank" className={s.kofi} rel="noreferrer">
                <Image
                    src={kofiImg}
                    alt='kofi'
                    loading='lazy'
                    style={{height: "2rem", width: "auto"}}
                />
            </a>
        </div>
    </DefaultPage>
}