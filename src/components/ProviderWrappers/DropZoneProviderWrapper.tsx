import { BodyDropper, DroppedFile } from "$cmp/Utility/BodyDropper"
import { FileKind, FileService, fileService, UnknownSong, UnknownSongImport } from "$lib/Services/FileService"
import { logger } from "$stores/LoggerStore";

interface DropZoneProviderProps {
    children: React.ReactNode
}
export function DropZoneProviderWrapper({ children }: DropZoneProviderProps) {

    const handleDrop = async (files: DroppedFile<UnknownSongImport>[]) => {
        try {
            for (const file of files) {
                const data = file.data
                const result = await fileService.importUnknownFile(data)
                const songs = result.getSuccessfulSongs()
                const songErrors = result.getSongErrors()
                for (const song of songs) {
                    logger.success(`Imported ${song.name}`)
                }  
                for (const file of songErrors) {
                    logger.error(`Error importing ${file.file?.name ?? ''}: ${file.error}`)
                }
                const folders = result.getSuccessfulFolders()
                const folderErrors = result.getFolderErrors()
                for (const folder of folders) {
                    logger.success(`Imported folder ${folder.name}`)
                }
                for (const file of folderErrors) {
                    logger.error(`Error importing ${file.file?.name ?? ''}: ${file.error}`)
                }
                const themes = result.getSuccessfulThemes()
                const themeErrors = result.getThemeErrors()
                for (const theme of themes) {
                    logger.success(`Imported ${theme?.other?.name ?? ''}`)
                }
                for (const file of themeErrors) {
                    logger.error(`Error importing theme: ${file.error}`)
                }
            }
        } catch (e) {
            console.error(e)
            logger.error("Error importing file")
        }
    }
    function handleDropError() {
        logger.error("There was an error importing the file! Was it the correct format?")

    }

    return <>
        <BodyDropper
            showDropArea={true}
            dropAreaStyle={{ paddingTop: '15vh' }}
            onDrop={handleDrop}
            as='json'
            onError={handleDropError}
        />
        {children}
    </>
}