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
                if (result.ok) {
                    const success = result.successful.filter(e => FileService.getSerializedObjectType(e) === FileKind.Song) as UnknownSong[]
                    const firstSong = success[0]
                    if (firstSong) {
                        //@ts-ignore
                        const type = firstSong.type ?? (firstSong.data?.isComposedVersion ? "composed" : "recorded")

                        if (success.length === 1) {
                            logger.success(`Song added to the ${type} tab!`, 4000)
                        } else if (success.length > 1) {
                            logger.success(`${success.length} songs added!`, 4000)
                        }
                    } else {
                        console.log('a')
                        logger.success('File imported!', 4000)
                    }

                } else {
                    const errors = result.errors.filter(e => FileService.getSerializedObjectType(e) === FileKind.Song) as UnknownSong[]
                    const firstError = errors[0]
                    if (firstError) {
                        logger.error(`Error importing the song ${firstError.name}!`, 4000)
                    }else{
                        logger.error(`Error importing the file!`, 4000)
                    }
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