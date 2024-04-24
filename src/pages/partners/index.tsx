import {PageMetadata} from '$cmp/shared/Miscellaneous/PageMetadata'
import {DefaultPage} from '$cmp/shared/pagesLayout/DefaultPage'
import partner from 'assets/images/partners/windsong-db.jpg'
import skyMusicianNetwork from 'assets/images/partners/sky-musician-network.jpg'
import Image, {StaticImageData} from 'next/image'
import s from './Partners.module.css'
import Link from "next/link";
import {BASE_PATH} from "$config";

export default function Partners() {
    return <DefaultPage className={s['partners-page']}>
        <PageMetadata text="Partners"
                      description='Learn about our partners who helped the development and to make the app more famous'/>
        <div className={s['partner-wrapper']}>
            <Partner
                name='EASYPLAY 1s'
                description='The perfect keyboard for Sky Music Nightly'
            >
                <Link
                    href={'https://summertones-1.kckb.me/18287a61'}
                    style={{width: '18.8rem', height: '10.5rem', overflow: 'hidden', borderRadius: '0.3rem'}}
                    target='_blank'
                    rel='noreferrer'
                >
                    <img
                        src={BASE_PATH + '/assets/blog/easyplay.webp'}
                        style={{width: '100%', objectFit: 'cover', height: 'auto'}}

                    />
                </Link>
            </Partner>
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
                name='ChaconneScott_ACG'
                description='YouTube pianist and arranger, features Genshin Impact OST'
            >
                <Iframe
                    src='https://www.youtube.com/embed/ltE8zfGfUVo'
                    title="ChaconneScott_ACG"
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
