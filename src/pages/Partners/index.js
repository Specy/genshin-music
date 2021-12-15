import './Partners.css'
import { SimpleMenu } from 'components/SimpleMenu'
import WindsongDBImg from 'assets/images/partners/windsong-db.jpg'
export default function Partners(props) {
    return <div className='partners-page'>
        <SimpleMenu functions={{ changePage: props.changePage }} />
        <div className='partner-wrapper'>
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
                    img={WindsongDBImg}
                    to='https://genshin-lyre.notion.site/genshin-lyre/Windsong-DB-8012b5f6939b486d857552c7b60e917f'
                    alt='Windsong DB'
                />

            </Partner>
        </div>

    </div>
}

function PartnerImg(props){
    return <a 
        href={props.to}
        style={{width: '18.8rem', height: '10.5rem', overflow: 'hidden', borderRadius: '0.3rem'}}
        target='_blank'
        rel='noreferrer'
    >
        <img 
            src={props.img} 
            style={{width: '100%', objectFit: 'cover'}}
            alt={props.alt}
        />
    </a>
}
function Iframe(props) {
    return <iframe
        src={props.src}
        title={props.src}
        frameBorder="0"
        allow="autoplay; picture-in-picture"
        allowFullScreen
    >
    </iframe>
}
function Partner(props) {
    return <div className='partner'>
        <div className='partner-title'>
            {props.name}
        </div>
        <div className='partner-description'>
            {props.description}
        </div>
        {props.children}
    </div>
}
