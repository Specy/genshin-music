import { IconButton } from "components/Inputs/IconButton";
import Memoized from "components/Utility/Memoized";
import { VsrgSong } from "lib/Songs/VsrgSong";
import { FaStop, FaSyncAlt } from "react-icons/fa";
import { VsrgPlayerScore } from "./VsrgPlayerScore";



interface VsrgPlayerRightProps {
    song: VsrgSong | null
    onStopSong: () => void
    onRetrySong: () => void
}

export function VsrgPlayerRight({ song, onStopSong, onRetrySong }: VsrgPlayerRightProps) {
    if (!song) return null
    return <>
        <div className="vsrg-player-right">
            <VsrgPlayerScore />
            <div className="row space-between" style={{gap: '0.2rem'}}>
                <IconButton onClick={onStopSong}>
                    <Memoized>
                        <FaStop />
                    </Memoized>
                </IconButton>
                <IconButton onClick={onRetrySong}>
                    <Memoized>
                        <FaSyncAlt />
                    </Memoized>
                </IconButton>
            </div>

        </div>
    </>
}