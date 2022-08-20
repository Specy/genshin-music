import { Fragment } from "react"
import { SettingsPropriety, SettingUpdate, SettingUpdateKey, SettingVolumeUpdate } from "$types/SettingsPropriety"
import SettingsRow from "./SettingsRow"

interface SettingsPaneProps {
    settings: {
        [key: string]: SettingsPropriety
    },
    changeVolume?: (data: SettingVolumeUpdate) => void,
    onUpdate: (data: SettingUpdate) => void
}
interface Group {
    category: string,
    settings: {
        [key: string]: SettingsPropriety
    }
}

export function SettingsPane({ settings, changeVolume, onUpdate }: SettingsPaneProps) {

    //group the settings by the category propriety
    const map = new Map<String, Group>();
    Object.entries(settings).forEach(([key, setting]) => {
        if (!map.has(setting.category)) {
            map.set(setting.category, {
                category: setting.category,
                settings: {}
            })
        }
        map.get(setting.category)!.settings[key] = setting
    })
    return <>
    
        {Array.from(map.values()).map(group =>
            <Fragment key={group.category}>
                <div className="column">
                    <h1 className="settings-group-title">
                        {group.category}
                    </h1>
                    {Object.entries(group.settings).map(([key, setting]) =>
                        <SettingsRow
                            key={key}
                            objKey={key as SettingUpdateKey}
                            data={setting}
                            changeVolume={changeVolume}
                            update={onUpdate}
                        />
                    )}
                </div>
            </Fragment>
        )}
    </>
}
