import {PageMetadata} from '$cmp/shared/Miscellaneous/PageMetadata'
import {DefaultPage} from '$cmp/shared/pagesLayout/DefaultPage'
import partner from 'assets/images/partners/windsong-db.jpg'
import skyMusicianNetwork from 'assets/images/partners/sky-musician-network.jpg'
import skyMemories from 'assets/images/partners/theskymemories.jpg'
import Image, {StaticImageData} from 'next/image'
import s from './Partners.module.css'
import Link from "next/link";
import {BASE_PATH} from "$config";
import {useTranslation} from "react-i18next";
import {useSetPageVisited} from "$cmp/shared/PageVisit/pageVisit";

export default function Partners() {
    useSetPageVisited('partners')
    const {t } = useTranslation("home")
    return <DefaultPage className={s['partners-page']}>
        <PageMetadata text={t('partners_name')}
                      description='Learn about our partners who helped the development and to make the app more famous'/>
        <div className={s['partner-wrapper']}>
            <Partner
                name='Specy'
                description='The youtube channel that collects videos created by users of this app'
            >
                <Iframe
                    src='https://www.youtube.com/embed/Sh7kqYVMjwM'
                    title="Specy"
                />
            </Partner>
            <Partner
                name='Sky Musician Network'
                description='A community discord server focused on music in Sky Cotl'
            >
                <PartnerImg
                    to='https://discord.gg/qW7uQgUfj9'
                    img={skyMusicianNetwork}
                    alt='Sky musician network'
                />
            </Partner>
            <Partner
                name='uma✿'
                description={`Arranges music, primarily from anime and games for Sky and Genshin.`}
            >
                <Iframe
                    src='https://www.youtube.com/embed/7aIkAGvp9Y0'
                    title="uma"
                />
            </Partner>
            <Partner
                name='Windsong DB'
                description='A Genshin Impact Database for Instrument Gadget Keymaps'
            >
                <PartnerImg
                    img={partner}
                    to='https://genshin-lyre.notion.site/genshin-lyre/Windsong-DB-8012b5f6939b486d857552c7b60e917f'
                    alt='Windsong DB'
                />

            </Partner>
            <Partner
                name={'The Sky Memories'}
                description={'An unofficial sanctuary to preserve all your sky memories'}
            >
                <PartnerImg
                    to={'https://theskymemories.com/'}
                    img={skyMemories}
                    alt={'The Sky Memories'}
                />
            </Partner>
        </div>
    </DefaultPage>
}

interface PartnerImgProps {
    to: string
    img: StaticImageData
    alt: string
}

function PartnerImg({to, img, alt}: PartnerImgProps) {
    return <a
        href={to}
        style={{width: '18.8rem', height: '10.5rem', overflow: 'hidden', borderRadius: '0.3rem'}}
        target='_blank'
        rel='noreferrer'
    >
        <Image
            loading='lazy'
            src={img}
            style={{width: '100%', objectFit: 'cover', height: 'auto'}}
            alt={alt}
        />
    </a>
}

interface IframeProps {
    src: string
    title: string
}

function Iframe({src, title}: IframeProps) {
    return <iframe
        src={src}
        title={title}
        frameBorder="0"
        allow="autoplay; picture-in-picture"
        allowFullScreen
    >
    </iframe>
}

interface PartnerProps {
    name: string
    description: string
    children: React.ReactNode
}

function Partner({name, description, children}: PartnerProps) {
    return <div className={s.partner}>
        <div className={s['partner-title']}>
            {name}
        </div>
        <div className={s['partner-description']}>
            {description}
        </div>
        {children}
    </div>
}
