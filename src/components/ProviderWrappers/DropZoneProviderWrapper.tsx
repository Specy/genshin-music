import { BodyDropper, DroppedFile } from "components/BodyDropper"
import { fileService, UnknownSongImport } from "lib/Services/FileService"
import { SerializedSong } from "lib/Songs/Song"
import LoggerStore from "stores/LoggerStore"

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
                    if(success.length === 1){
                        LoggerStore.success(`Song added to the ${result.successful[0].type} tab!`, 4000)
                    }
                } else {
                    const errors = result.errors.map(s => s.name || "UNKNOWN").join(", ")
                    LoggerStore.error(`There was an error importing the song: ${errors}`)
                }
            }
        }catch(e){
            console.error(e)
            LoggerStore.error("Error importing file")
        }
    }
    function handleDropError() {
        LoggerStore.error("There was an error importing the file! Was it the correct format?")

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