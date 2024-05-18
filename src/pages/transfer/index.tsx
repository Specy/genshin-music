import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {Select} from "$cmp/shared/Inputs/Select";
import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {APP_NAME} from "$config";
import {protocol, setupProtocol} from "$lib/Hooks/useWindowProtocol";
import {logger} from "$stores/LoggerStore";
import {useCallback, useEffect, useState} from "react";
import s from "./transfer.module.css"
import {fileService, UnknownFileTypes} from "$lib/Services/FileService";
import {PageMetadata} from "$cmp/shared/Miscellaneous/PageMetadata";
import {Row} from "$cmp/shared/layout/Row";
import {Column} from "$cmp/shared/layout/Column";
import {useTranslation} from "react-i18next";
import {useSetPageVisited} from "$cmp/shared/PageVisit/pageVisit";

const domains = [
    `https://${APP_NAME.toLowerCase()}-music.specy.app`,
    `https://beta.${APP_NAME.toLowerCase()}-music.specy.app`,
    `https://specy.github.io/${APP_NAME.toLowerCase()}Music`,
    ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000"] : [])
]

export default function TransferData() {
    useSetPageVisited('transfer')
    const {t} = useTranslation(['transfer', 'common'])
    const [selectedDomain, setSelectedDomain] = useState<string>(domains[0])
    const [validDomains, setValidDomains] = useState<string[]>([])
    const [error, setError] = useState<string>()
    const [importedData, setImportedData] = useState<UnknownFileTypes[] | null>(null)

    const fetchData = useCallback(async () => {
        const frame = document.createElement("iframe")
        frame.src = selectedDomain
        frame.style.display = "none"
        document.body.appendChild(frame)
        logger.showPill(t('connecting_please_wait'))
        try {
            await new Promise((res, rej) => {
                frame.onload = res
                frame.onerror = rej
            })
            setError("")
            setImportedData(null)
            await protocol.connect(frame.contentWindow!)
            console.log("connected")
            const data = await protocol.ask("getAppData", undefined)
            setImportedData(Array.isArray(data) ? data : [data])
        } catch (e) {
            logger.error(t('error_connecting'))
            setError(`Error fetching: ${e}`)
        }
        logger.hidePill()
        frame.remove()
        return () => {
            logger.hidePill()
            frame.remove()
        }
    }, [selectedDomain, t])


    useEffect(() => {
        const filtered = domains.filter(d => d !== window.location.origin)
        setSelectedDomain(filtered[0])
        setValidDomains(filtered)
        setupProtocol().catch(console.error)
    }, [])

    return <DefaultPage>
        <PageMetadata text="Import data" description="A tool to import the data you have in other domains"/>
        <div className="column">
            <h1>{t('import_data_from_other_domains_title')}</h1>
            <p style={{marginLeft: "1rem"}}>
                {t('import_data_from_other_domains_description')}
            </p>
            <h2>
                {t('select_a_website_to_import_data')}
            </h2>
            <div className="row" style={{gap: "0.5rem", marginLeft: "1rem"}}>
                <Select
                    value={selectedDomain}
                    style={{minWidth: "12rem"}}
                    onChange={e => setSelectedDomain(e.target.value)}
                >
                    {validDomains.map(d => <option value={d} key={d}>{d.replace(/https?:\/\//g, "")}</option>)}
                </Select>
                <AppButton
                    cssVar="accent"
                    onClick={fetchData}
                >
                    {t('common:connect')}
                </AppButton>
            </div>

            {importedData && <>
                {importedData.length === 0 &&
                    <h2>{t('no_data_to_import')}</h2>
                }
                {importedData.length > 0 && <>
                    {error
                        ? <>
                            <h2>{t('common:error')}:</h2>
                            <p>{error}</p>
                        </>
                        : <>
                            <Column>
                                <Row align={'center'} style={{gap: "1rem"}}>
                                    <h2>{t('data')}</h2>
                                    <AppButton
                                        cssVar="accent"
                                        onClick={async () => {
                                            await fileService.importAndLog(importedData)
                                            setImportedData([])
                                        }}
                                    >
                                        {t('import_all')}
                                    </AppButton>
                                </Row>
                                <Column style={{gap: "0.3rem"}}>
                                    {importedData.map((d, i) =>
                                        <ImportedRow
                                            data={d}
                                            key={d.id ?? i}
                                            onImport={async data => {
                                                await fileService.importAndLog(data)
                                                setImportedData(importedData.filter(d => d !== data))
                                            }}
                                        />
                                    )}
                                </Column>
                            </Column>
                        </>
                    }
                </>}
            </>
            }
        </div>
    </DefaultPage>
}

interface ImportedRowProps {
    data: UnknownFileTypes
    onImport: (data: UnknownFileTypes) => void
}

function ImportedRow({data, onImport}: ImportedRowProps) {
    const { t} = useTranslation("common")
    let name = ""
    if (data.type === "theme") name = data.other?.name
    else name = data.name


    return <Row align={'center'} className={s["import-row"]}>
        <div className={s["import-type"]}>
            {data.type}
        </div>
        <Row padding={'0 0.5rem'}>
            {name}
        </Row>
        <AppButton
            cssVar="accent"
            style={{marginLeft: "auto"}}
            onClick={() => onImport(data)}
        >
            {t('import')}
        </AppButton>
    </Row>
}