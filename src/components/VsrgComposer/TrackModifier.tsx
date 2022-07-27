import { AppButton } from "components/Inputs/AppButton";
import { VsrgTrackModifier } from "lib/Songs/VsrgSong";
import { ThemeStore } from "stores/ThemeStore";


interface TrackModifierProps{
    data: VsrgTrackModifier
    theme: ThemeStore
    onChange: (data: VsrgTrackModifier) => void
    onVisibilityChange: (visible: boolean) => void
}

export function TrackModifier({data, onChange, onVisibilityChange, theme}: TrackModifierProps){
    const color = theme.layer('menu_background', 0.2).desaturate(0.5)
    return <>
        <div className="row-centered space-between track-modifier" style={{backgroundColor: color.hex()}}>
            <span className="text-ellipsis">
                {data.alias}
            </span>
            <div className="row-centered" style={{justifyContent: 'flex-end'}}>
                <AppButton 
                    onClick={() => onVisibilityChange(!data.hidden)}
                    toggled={data.hidden}
                >
                    {data.hidden ? "Show" : "Hide"}
                </AppButton>
                <AppButton
                    style={{marginLeft: '0.5rem'}}
                    onClick={() => onChange(data.set({muted: !data.muted}))}
                    toggled={data.muted}
                >
                    {data.muted ? "Unmute" : "Mute"}
                </AppButton>
            </div>
        </div>
    </>
}