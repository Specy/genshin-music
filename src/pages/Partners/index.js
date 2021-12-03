import ToHome from 'components/ToHome'
import './Partners.css'
export default function Partners(props) {
    return <div className='support-page'>
        <ToHome changePage={props.changePage}/>
        Coming soon
    </div>
}

function Partner(props){
    return <div>
        {props.children}
    </div>
}
