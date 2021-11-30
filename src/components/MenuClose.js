import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes } from '@fortawesome/free-solid-svg-icons'

export default function MenuClose(props) {
    return <div onClick={() => props.action(false)} className="close-menu menu-item">
        <FontAwesomeIcon icon={faTimes} className="icon" />
    </div>
}