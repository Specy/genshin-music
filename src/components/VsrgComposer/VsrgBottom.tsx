import { AppButton } from "components/Inputs/AppButton"
import { Select } from "components/Inputs/Select"
import { useState } from "react"
import { FaPlay } from "react-icons/fa"
import { MultipleOptionSlider } from "./MultipleOptionSlider"

interface VsrgBottomProps {

    onHitObjectTypeChange: (hitObjectType: HitObjectType) => void
}

type HitObjectType = 'hold' | 'tap' | 'delete'
const options: HitObjectType[] = ['tap', 'hold', 'delete']
const snapPoints = [1,2,4,8,16]
export function VsrgBottom() {
    const [hitObjectType, setHitObjectType] = useState<HitObjectType>('tap')
    const [selectedSnapPoint, setSelectedSnapPoint] = useState<number>(1)

    return <>
        <div className="vsrg-bottom">
            <MultipleOptionSlider
                options={options}
                selected={hitObjectType}
                onChange={(value: HitObjectType) => setHitObjectType(value)}
            />
            <div>
                Song name 0:40 / 2:10
            </div>
            <div className='flex-centered' style={{height: '100%'}}>
                <Select
                    value={selectedSnapPoint}
                    onChange={(value) => setSelectedSnapPoint(parseInt(value.target.value))}
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