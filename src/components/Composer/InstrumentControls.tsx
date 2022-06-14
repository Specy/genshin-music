import { AppButton } from "components/AppButton";
import { useTheme } from "lib/Hooks/useTheme";
import { ComposedSongInstrument } from "lib/Songs/ComposedSong";
import { FaPlus } from "react-icons/fa";
import { Theme, ThemeStoreClass } from "stores/ThemeStore";



interface InstrumentControlsProps{
    instruments: ComposedSongInstrument[]
    selected: number
    onLayerSelect: (index: number) => void
    onInstrumentChange: (instrument: ComposedSongInstrument) => void
    onInstrumentDelete: (instrument: ComposedSongInstrument) => void
    onInstrumentAdd: () => void
}

export function InstrumentControls({ instruments, onInstrumentAdd, onInstrumentChange, onInstrumentDelete , selected, onLayerSelect}: InstrumentControlsProps){
    const [theme] = useTheme()
    return <div className="column instruments-button-wrapper">
        {instruments.map((ins,i) => 
            <InstrumentButton 
                theme={theme}
                instrument={ins}
                isSelected={i === selected}
                onClick={() => onLayerSelect(i)}
                key={ins.name + i}
            />
        )}
        <AppButton style={{height: '3rem', marginTop: 'auto'}} onClick={onInstrumentAdd}>
            <FaPlus size={20} color='var(--icon-color)'/>
        </AppButton>
    </div>
}


interface InstrumentButtonProps{
    instrument: ComposedSongInstrument
    theme: ThemeStoreClass
    isSelected: boolean,
    onClick: () => void
}
function InstrumentButton({instrument, onClick, isSelected, theme}: InstrumentButtonProps){
    return <AppButton 
            className="instrument-button flex-centered" 
            style={isSelected ? {backgroundColor: theme.layer("primary",0.1).toString()} : {}}
            onClick={onClick}
        >
            {instrument.name}
    </AppButton>
}