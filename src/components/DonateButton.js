export default function DonateButton(props){
    return <div className="donate-button" onClick={() => props.onClick("Donate")}>
        Donate
    </div>
}