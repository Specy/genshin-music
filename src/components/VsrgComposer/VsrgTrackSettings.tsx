import { InstrumentSelect } from "components/Inputs/InstrumentSelect"
import { AppButton } from "components/Inputs/AppButton"
import { VsrgTrack } from "lib/Songs/VsrgSong"
import { FaTrash } from "react-icons/fa"
import { PitchSelect } from "components/Inputs/PitchSelect"
import { HelpTooltip } from "components/Utility/HelpTooltip"
import { ColorPicker } from "components/Inputs/ColorPicker"
import { useState } from "react"
import Color from "color"
import { vsrgComposerStore } from "stores/VsrgComposerStore"
import { Pitch } from "appConfig"

interface TrackSelectorProps {
    track: VsrgTrack
    onSave: () => void
    onDelete: () => void
    onChange: (track: VsrgTrack) => void
}

export function VsrgTrackSettings({ track, onSave, onDelete, onChange }: TrackSelectorProps) {
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false)
    if (!track) return null
    return <>
        <div className="vsrg-floating-settings box-shadow">
            <div className="row-centered space-between">
                Track name
                <input
                    type="text"
                    maxLength={50}
                    className="input"
                    style={{ width: '7.4rem' }}
                    value={track.instrument.alias}
                    onChange={e => {
                        track.instrument.set({ alias: e.target.value })
                        onChange(track)
                    }}
                    placeholder={track.instrument.name}
                />
            </div>
            <div className="row-centered space-between" style={{ marginTop: '0.4rem' }}>
                Instrument
                <InstrumentSelect
                    style={{ width: '8rem' }}
                    selected={track.instrument.name}
                    onChange={(name) => {
                        track.instrument.set({ name })
                        onChange(track)
                    }}
                />
            </div>
            <div className="row-centered space-between" style={{ marginTop: '0.4rem' }}>
                Pitch
                <PitchSelect
                    style={{ width: '8rem' }}
                    selected={track.instrument.pitch as Pitch}
                    onChange={(pitch) => {
                        track.instrument.set({ pitch })
                        onChange(track)
                    }}
                >
                    <option value="">
                        Use song pitch
                    </option>
                </PitchSelect>
            </div>
            <div className="row-centered" style={{ marginTop: '1rem', alignItems: "center" }}>
                Volume
                <span style={{
                    marginLeft: "0.4rem",
                    width: '3rem',
                    ...(track.instrument.volume > 100
                        && { color: `hsl(0, ${-40 + track.instrument.volume}%, 61%)`, marginLeft: "0.4rem" })
                }}
                >
                    {track.instrument.volume}%
                </span>
                <HelpTooltip
                    buttonStyle={{ width: '1.2rem', height: '1.2rem' }}
                    width={10}
                >
                    If you hear distortion, reduce the volume
                </HelpTooltip>
            </div>
            <div className="row-centered">
                <input
                    type="range"
                    style={{ flex: '1' }}
                    min={0}
                    max={125}
                    value={track.instrument.volume}
                    onChange={e =>{
                        track.instrument.set({ volume: parseInt(e.target.value) })
                        onChange(track)
                    }}
                />
            </div>
            <div className="column">
                <div className="row-centered space-between">
                    Color
                    <AppButton
                        onClick={() => setIsColorPickerOpen(true)}

                        ariaLabel='Change color'
                        style={{
                            backgroundColor: track.color,
                            color: Color(track.color).isDark() ? '#fff' : '#000',
                        }}
                    >
                        Change
                    </AppButton>
                </div>
            </div>
            <div className='row space-between' style={{ marginTop: '0.4rem' }}>
                <AppButton
                    className="row-centered"
                    style={{ padding: '0.4rem', width: 'fit-content' }}
                    onClick={onDelete}
                >
                    <FaTrash color="var(--red)" style={{ marginRight: '0.3rem' }} />
                    Delete
                </AppButton>
                <AppButton
                    onClick={onSave}
                    style={{ padding: '0.4rem', width: 'fit-content' }}
                >
                    Ok
                </AppButton>
            </div>
        </div>
        {isColorPickerOpen &&
            <ColorPicker
                style={{
                    right: '0.8rem',
                    top: '0.5rem',
                }}
                value={track.color}
                onChange={color => {
                    onChange(track.set({ color }))
                    setIsColorPickerOpen(false)
                    vsrgComposerStore.emitEvent("colorChange")
                }}
            />
        }
    </>
}