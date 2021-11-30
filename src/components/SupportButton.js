export default function SupportButton(props){
    return <div className="donate-button" to='/Support' onClick={() => props.onClick("Support")}>
        Support me
    </div>
}