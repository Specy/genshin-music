import s from './pageVisit.module.scss'
import {PAGES_VERSIONS, PagesVersionsKeys} from "$/PagesVersions";
import {CSSProperties, useEffect, useState} from "react";
import {APP_NAME} from "$config";
import {makeObservable, observable} from "mobx";
import {useObservableObject} from "$lib/Hooks/useObservable";
import {useTranslation} from "react-i18next";
import {logger} from "$stores/LoggerStore";
import {i18n} from "$i18n/i18n";


const localStorageKey = `${APP_NAME}_visited_pages`

class PageVisitStore {
    @observable
    state: {
        key: number
    } = {
        key: 0
    }

    constructor() {
        makeObservable(this)
    }

    refreshKey() {
        this.state.key++
    }
}

const store = new PageVisitStore()

export function usePageVisit(pageKey: PagesVersionsKeys) {
    const [visited, setVisited] = useState({version: 0, visited: true})
    const {key} = useObservableObject(store.state)
    const {t} = useTranslation('common')
    useEffect(() => {
        const visitedPages = JSON.parse(localStorage.getItem(localStorageKey) || '{}')
        const visitedPageVersion = visitedPages[pageKey] ?? -1
        if (PAGES_VERSIONS[pageKey]?.version > 0) {
            const currentVersion = PAGES_VERSIONS[pageKey]?.version
            setVisited({version: visitedPageVersion, visited: visitedPageVersion >= currentVersion})
        }
    }, [key]);

    return {
        visited,
        style: !visited.visited
            ? {'--new-text': `"${t('new')}!"`} as CSSProperties
            : undefined,
        className: !visited.visited ? s['non-visited'] : undefined
    }
}

export function useSetPageVisited(key: PagesVersionsKeys) {
    useEffect(() => {
        const visitedPages = JSON.parse(localStorage.getItem(localStorageKey) || '{}')
        const currentVersion = PAGES_VERSIONS[key].version
        const visitedVersion = visitedPages[key] ?? -1
        //if there are changes to this page, log them
        if (currentVersion > visitedVersion) {
            const changes = PAGES_VERSIONS[key].changes.map(e => `- ${e}`).join('\n')
            if (changes) {
                setTimeout(() => {
                    logger.success(`${i18n.t('home:new_changes_to_page')}\n\n${changes}`, 8000)
                }, 500)
            }
        }
        visitedPages[key] = PAGES_VERSIONS[key].version
        localStorage.setItem(localStorageKey, JSON.stringify(visitedPages))
        store.refreshKey()
    }, []);
}

