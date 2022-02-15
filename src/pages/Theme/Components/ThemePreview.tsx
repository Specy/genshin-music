import { appName } from "appConfig";
import { FileDownloader } from "lib/Utils";
import { FaTrash, FaDownload } from "react-icons/fa";
import { Theme } from "stores/ThemeStore";


interface ThemePreviewProps {
    theme: Theme,
    current: boolean,
    onClick: (theme: Theme) => void,
    onDelete: (theme: Theme) => void
}
export function ThemePreview({ theme, onClick, onDelete,current }: ThemePreviewProps) {
    return <div
        className="theme-preview"
        onClick={() => onClick(theme)}
        style={{
            backgroundColor: theme.data.background.value,
            ...(current ? 
                {border:'solid 3px var(--accent)'} : 
                {boxShadow: `0px 0px 10px 0px rgba(0,0,0,0.4)`})
        }}
    >
        <div className="theme-preview-row">
            <div className="theme-name">
                {theme.other.name}
            </div>
            <div>
                <FaDownload
                    onClick={(e) => {
                        e.stopPropagation()
                        new FileDownloader('json').download(
                            JSON.stringify(theme),
                            `${theme.other.name || appName}.theme.json`
                        )
                    }}
                    size={18}
                    cursor='pointer'

                />
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
function trimName(name: string) {
    return name.replace('_', ' ').replace(' background', ' bg')
}