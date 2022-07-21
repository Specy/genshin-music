import { AppButton } from "components/Inputs/AppButton"
import { Select } from "components/Inputs/Select"
import { useState } from "react"
import { FaPlay } from "react-icons/fa"
import { MultipleOptionSlider, Option } from "./MultipleOptionSlider"

interface VsrgBottomProps {
    selectedSnapPoint: SnapPoint
    onSnapPointChange: (snapPoint: SnapPoint) => void
    onHitObjectTypeChange: (hitObjectType: VsrgHitObjectType) => void
}

export type VsrgHitObjectType = 'hold' | 'tap' | 'delete'
const options: Option<VsrgHitObjectType>[] = [
    {
        value: 'tap',
        color: 'var(--accent)',
    },{
        value: 'hold',
        color: '#8569a9',
    },{
        value: 'delete',
        color: 'var(--red)',
    }
]
const snapPoints:SnapPoint[] = [1,2,4,8,16]
export type SnapPoint = 1 | 2 | 4 | 8 | 16
export function VsrgBottom({ onSnapPointChange, onHitObjectTypeChange, selectedSnapPoint }:VsrgBottomProps) {
    const [hitObjectType, setHitObjectType] = useState<VsrgHitObjectType>('tap')

    return <>
        <div className="vsrg-bottom">
            <MultipleOptionSlider
                options={options}
                selected={hitObjectType}
                onChange={(value: VsrgHitObjectType) => {
                    setHitObjectType(value)
                    onHitObjectTypeChange(value)
                }}
            />
            <div>
                Song name 0:40 / 2:10
            </div>
            <div className='flex-centered' style={{height: '100%'}}>
                <Select
                    value={selectedSnapPoint}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value) as SnapPoint
                        onSnapPointChange(parsed)
                    }}
                    style={{width: '8rem', height: '100%', borderRadius: '0.4rem'}}
                >
                    {snapPoints.map(snapPoint =>
                        <option key={snapPoint} value={snapPoint}>
                            Snap: 1/{snapPoint}
                        </option>
                    )}
                </Select>
                <AppButton className="vsrg-play-button flex-centered">
                    <FaPlay size={20}/>
                </AppButton>
            </div>
        </div>
    </>
}