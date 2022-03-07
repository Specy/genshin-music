import { APP_NAME } from "appConfig";
import { FileDownloader } from "lib/Utils/Tools";
import { FaTrash, FaDownload } from "react-icons/fa";
import { Theme } from "stores/ThemeStore";


interface ThemePreviewProps {
    theme: Theme,
    current: boolean,
    onClick?: (theme: Theme) => void,
    onDelete?: (theme: Theme) => void,
    downloadable?: boolean
}
export function ThemePreview({ theme, onClick, onDelete, current, downloadable }: ThemePreviewProps) {
    return <div
        className="theme-preview"
        onClick={() => { if (onClick) onClick(theme) }}
        style={{
            backgroundColor: theme.data.background.value,
            color: theme.data.background.text,
            ...(current ?
                { border: 'solid 2px var(--accent)' } :
                { boxShadow: `0px 0px 10px 0px rgba(0,0,0,0.4)` })
        }}
    >
        <div className="theme-preview-row">
            <div className="theme-name">
                {theme.other.name}
            </div>
            <div>
                {downloadable &&
                    <FaDownload
                        color={theme.data.background.text}
                        onClick={(e) => {
                            e.stopPropagation()
                            FileDownloader.download(
                                JSON.stringify(theme),
                                `${theme.other.name || APP_NAME}.theme.json`
                            )
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
                        color: value.text
                    }}
                >
                </div>
            )}
        </div>
    </div>
}