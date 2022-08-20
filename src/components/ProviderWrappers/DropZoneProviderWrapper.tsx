import { BodyDropper, DroppedFile } from "$cmp/Utility/BodyDropper"
import { fileService, UnknownSongImport } from "$lib/Services/FileService"
import {logger} from "$stores/LoggerStore";

interface DropZoneProviderProps {
    children: React.ReactNode
}
export function DropZoneProviderWrapper({ children }: DropZoneProviderProps) {

    const handleDrop = async (files: DroppedFile<UnknownSongImport>[]) => {
        try{
            for (const file of files) {
                const songs = file.data
                const result = await fileService.addSongs(songs)
                if(result.ok){
                    const success = result.successful.map(e => e.name)
                    const firstSong = result.successful[0]
                    //@ts-ignore
                    const type = firstSong.type ?? (firstSong.data?.isComposedVersion ? "composed" : "recorded")

                    if(success.length === 1){
                        logger.success(`Song added to the ${type} tab!`, 4000)
                    }else if (success.length > 1){
                        logger.success(`${success.length} songs added!`, 4000)
                    }
                } else {
                    const errors = result.errors.map(s => s.name || "UNKNOWN").join(", ")
                    logger.error(`There was an error importing the song: ${errors}`)
                }
            }
        }catch(e){
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