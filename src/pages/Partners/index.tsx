import './Partners.css'
import { SimpleMenu } from 'components/SimpleMenu'

export default function Partners() {
    return <div className='default-page partners-page'>
        <SimpleMenu/>
        <div className='default-content partner-wrapper'>
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
                name='ChaconneScott_ACG'
                description='YouTube pianist and arranger, features Genshin Impact OST'
            >
                <Iframe
                    src='https://www.youtube.com/embed/ltE8zfGfUVo'
                    title="ChaconneScott_ACG"
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
                    img={'./assets/images/partners/windsong-db.jpg'}
                    to='https://genshin-lyre.notion.site/genshin-lyre/Windsong-DB-8012b5f6939b486d857552c7b60e917f'
                    alt='Windsong DB'
                />

            </Partner>
        </div>

    </div>
}

interface PartnerImgProps{
    to: string
    img: string
    alt: string
}
function PartnerImg({to, img, alt}: PartnerImgProps){
    return <a 
        href={to}
        style={{width: '18.8rem', height: '10.5rem', overflow: 'hidden', borderRadius: '0.3rem'}}
        target='_blank'
        rel='noreferrer'
    >
        <img 
            loading='lazy'
            src={img} 
            style={{width: '100%', objectFit: 'cover'}}
            alt={alt}
        />
    </a>
}
interface IframeProps{
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
interface PartnerProps{
    name: string
    description: string
    children: React.ReactNode
}
function Partner({name, description, children}: PartnerProps) {
    return <div className='partner'>
        <div className='partner-title'>
            {name}
        </div>
        <div className='partner-description'>
            {description}
        </div>
        {children}
    </div>
}
