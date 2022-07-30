import { AppButton } from "components/Inputs/AppButton";
import { VsrgSong } from "lib/Songs/VsrgSong";



interface VsrgPlayerRightProps {
    song: VsrgSong | null
    onStopSong: () => void
}

export function VsrgPlayerRight({ song, onStopSong }: VsrgPlayerRightProps) {

    if(!song) return null
    return <>
        <div className="vsrg-player-right">
            <AppButton onClick={onStopSong}>
                Stop
            </AppButton>
        </div>
    </>
}