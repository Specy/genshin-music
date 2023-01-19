import { APP_NAME } from "$/Config";
import { fileService } from "$lib/Services/FileService";
import { FaTrash, FaDownload } from "react-icons/fa";
import { logger } from "$stores/LoggerStore";
import { SerializedTheme } from "$stores/ThemeStore/ThemeProvider";
import Color from "color";


interface ThemePreviewProps {
    theme: SerializedTheme,
    current: boolean,
    onClick?: (theme: SerializedTheme) => void,
    onDelete?: (theme: SerializedTheme) => void,
    downloadable?: boolean
}
export function ThemePreview({ theme, onClick, onDelete, current, downloadable }: ThemePreviewProps) {
    const image = theme.other.backgroundImageMain || theme.other.backgroundImageComposer
    return <div
        className="theme-preview"
        onClick={() => { if (onClick) onClick(theme) }}
        style={{
            backgroundColor: theme.data.background.value,
            color: theme.data.background.text,
            ...(current ?
                { outline: 'solid 0.2rem var(--accent)' } :
                { boxShadow: `0px 0px 10px 0px rgba(0,0,0,0.4)` })
        }}
    >
        <div
            className="theme-preview-bg"
            style={{
                backgroundImage: `url(${image})`,
            }}
        >
        </div>
        <div 
            className="theme-preview-row"
            style={{
                backgroundColor: Color(theme.data.background.value).fade(0.3).toString(),
                zIndex: 2,
                textShadow: image ? '0px 0px 10px rgba(0,0,0,0.4)' : "none"
            }}
        >
            <div
                className="text-ellipsis"
                style={{ 
                    zIndex: 2, 
                    padding: "0.4rem 0.2rem",
                }}
            >
                {theme.other.name}
            </div>

            <div style={{ display: "flex", marginLeft: "0.2rem", zIndex: 2, padding: "0.4rem 0.2rem" }}>
                {downloadable &&
                    <FaDownload
                        color={theme.data.background.text}
                        onClick={(e) => {
                            e.stopPropagation()
                            logger.success(`The theme "${theme.other.name}" was downloaded`)
                            fileService.downloadTheme(theme, `${theme.other.name || APP_NAME}.theme`)
                        }}
                        size={18}
                        cursor='pointer'
                    />

                }
                {onDelete &&
                    <FaTrash
                        onClick={(e) => {
                            e.stopPropagation()
                            onDelete(theme)
                        }}
                        size={18}
                        style={{
                            marginLeft: '0.5rem'
                        }}
                        color='var(--red)'
                        cursor='pointer'
                    />
                }
            </div>
        </div>
        <div className="theme-preview-colors">
            {Object.entries(theme.data).map(([key, value]) =>
                <div
                    key={key}
                    style={{
                        backgroundColor: value.value,
                        color: value.text,
                    }}
                >
                </div>
            )}
        </div>
    </div>
}