import { FaTimes } from 'react-icons/fa'
export default function MenuClose(props) {
    return <div onClick={() => props.action(false)} className="close-menu menu-item">
        <FaTimes className="icon" />
    </div>
}