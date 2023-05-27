import { BodyDropper, DroppedFile } from "$cmp/Utility/BodyDropper"
import { fileService, UnknownSongImport } from "$lib/Services/FileService"
import { logger } from "$stores/LoggerStore";

interface DropZoneProviderProps {
    children: React.ReactNode
}
export function DropZoneProviderWrapper({ children }: DropZoneProviderProps) {
    const handleDrop = async (files: DroppedFile<UnknownSongImport>[]) => {
        try {
            for (const file of files) {
                const data = file.data
                await fileService.importAndLog(data)
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
            onDrop={handleDrop}
            as='json'
            onError={handleDropError}
        />
        {children}
    </>
}