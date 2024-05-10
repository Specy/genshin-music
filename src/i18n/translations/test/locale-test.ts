import {i18n_en} from "$i18n/translations/en";
import {AppI18N} from "$i18n/i18n";

function prefixKeysWithChar(obj: Record<string, any>, replace: string): Record<string, any> {
    const res: Record<string, any> = {}
    for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'object') {
            res[key] = prefixKeysWithChar(val, replace)
        } else {
            res[key] = `${replace}${key}`
        }
    }
    return res
}

export const i18n_test = prefixKeysWithChar(i18n_en, "^") as AppI18N