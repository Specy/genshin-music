import {MdKeyboardReturn } from 'react-icons/md'
export default function ToHome(props) {
    return <div className='support-page'>
        <div
            className='absolute-changelog-btn'
            onClick={() => props.changePage('')}
        >
            <MdKeyboardReturn size={25} />
        </div>
        
    </div>
}
