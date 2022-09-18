import { AppButton, AppButtonProps } from "./AppButton"



interface IconButtonProps extends AppButtonProps{
    size?: string
}

export function IconButton(props: IconButtonProps) {
    return <AppButton 
        {...props} 
        style={{
            width: props.size ?? '2rem',
            height: props.size ?? '2rem',
            minWidth: props.size ?? '2rem',
            minHeight: props.size ?? '2rem',
            ...props.style
        }}
        className={`icon-app-button flex-centered ${props.className ?? ''}`}
    >
        {props.children}
    </AppButton>

}