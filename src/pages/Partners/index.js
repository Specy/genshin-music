import './Partners.css'
import { SimpleMenu } from 'components/SimpleMenu'
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
        </div>

    </div>
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
