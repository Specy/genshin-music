import { FaTrash } from "react-icons/fa";
import { Theme } from "stores/ThemeStore";


interface ThemePreviewProps{
    theme: Theme,
    onClick: (theme: Theme) => void,
    onDelete: (theme: Theme) => void
}
export function ThemePreview({theme, onClick, onDelete}:ThemePreviewProps){
    return <div 
            className="theme-preview" 
            onClick={() => onClick(theme)}
            style={{
                backgroundColor: theme.data.background.value,
                border: `solid 2px ${theme.data.background.text}`
            }}
        >
        <div className="theme-preview-row">
            {theme.other.name}
            <FaTrash 
                onClick={() => onDelete(theme)} size={22} 
                color='var(--red)'
                cursor='pointer'
            />
        </div>
        <div className="theme-preview-colors">
            {Object.entries(theme.data).map(([key,value]) => 
                <div 
                    key={key}
                    style={{
                        backgroundColor: value.value,
                        color: value.text
                    }}   
                >
                    {key}
                </div>
            )}
        </div>
    </div>
}