export default function FloatingMessage(props){
    const { title, text, visible, onClick} = props
	let classes = visible ? "floating-message floating-message-visible" : "floating-message"
    return <div className={classes} onClick={onClick}>
    <div className="floating-message-title">
        {title}
    </div>
    <div className="floating-message-text">
        {text}
    </div>
</div>
}