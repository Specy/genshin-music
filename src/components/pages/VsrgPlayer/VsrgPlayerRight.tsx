import {IconButton} from "$cmp/shared/Inputs/IconButton";
import {MemoizedIcon} from "$cmp/shared/Utility/Memoized";
import {VsrgSong} from "$lib/Songs/VsrgSong";
import {FaStop, FaSyncAlt} from "react-icons/fa";
import {VsrgPlayerScore} from "./VsrgPlayerScore";
import s from "./VsrgPlayerRight.module.css";


interface VsrgPlayerRightProps {
    song: VsrgSong | null
    onStopSong: () => void
    onRetrySong: () => void
}

export function VsrgPlayerRight({song, onStopSong, onRetrySong}: VsrgPlayerRightProps) {
    if (!song) return null
    return <>
        <div className={s['vsrg-player-right']}>
            <div className="row space-between" style={{gap: '0.2rem'}}>
                <IconButton onClick={onStopSong}>
                    <MemoizedIcon icon={FaStop}/>
                </IconButton>
                <IconButton onClick={onRetrySong}>
                    <MemoizedIcon icon={FaSyncAlt}/>
                </IconButton>
            </div>
        </div>
        <VsrgPlayerScore/>
    </>
}