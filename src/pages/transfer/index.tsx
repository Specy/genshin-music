import { AppButton } from "$cmp/Inputs/AppButton";
import { Select } from "$cmp/Inputs/Select";
import { DefaultPage } from "$cmp/Layout/DefaultPage";
import { APP_NAME } from "$config";
import { protocol, setupProtocol } from "$lib/Hooks/useWindowProtocol";
import { logger } from "$stores/LoggerStore";
import { useState, useEffect, useCallback } from "react";
import s from "./transfer.module.css"
import { cn } from "$lib/Utilities";
import { UnknownFileTypes, fileService } from "$lib/Services/FileService";
import { Title } from "$cmp/Miscellaneous/Title";

const domains = [
    `https://${APP_NAME.toLowerCase()}-music.specy.app`,
    `https://beta.${APP_NAME.toLowerCase()}-music.specy.app`,
    `https://specy.github.io/${APP_NAME.toLowerCase()}Music`,
    `http://localhost:3000`,
]

export default function TransferData() {
    const [selectedDomain, setSelectedDomain] = useState<string>(domains[0])
    const [validDomains, setValidDomains] = useState<string[]>([])
    const [error, setError] = useState<string>()
    const [importedData, setImportedData] = useState<UnknownFileTypes[] | null>(null)

    const fetchData = useCallback(async () => {
        const frame = document.createElement("iframe")
        frame.src = selectedDomain
        frame.style.display = "none"
        document.body.appendChild(frame)
        logger.showPill("Conneting please wait...")
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
            logger.error("Error connecting, please visit the domain, there might be updates. ")
            setError(`Error fetching: ${e}`)
        }
        logger.hidePill()
        frame.remove()
        return () => {
            logger.hidePill()
            frame.remove()
        }
    }, [selectedDomain])


    useEffect(() => {
        const filtered = domains.filter(d => d !== window.location.origin)
        setSelectedDomain(filtered[0])
        setValidDomains(filtered)
        setupProtocol().catch(console.error)
    }, [])

    return <DefaultPage>
        <Title text="Import data" description="A tool to import the data you have in other domains" />
        <div className="column">
            <h1>Import data from other domains</h1>
            <p style={{ marginLeft: "1rem" }}>
                Here you can import data from other existing domains of the app, select the domain you want to import from and click import.
                You will be shown all the data from the other domain, and you can select to import it all at once or only what you need.
            </p>
            <h2>
                Select a website to import data from
            </h2>
            <div className="row" style={{ gap: "0.5rem", marginLeft: "1rem" }}>
                <Select
                    value={selectedDomain}
                    style={{ minWidth: "12rem" }}
                    onChange={e => setSelectedDomain(e.target.value)}
                >
                    {validDomains.map(d => <option value={d} key={d}>{d.replace(/https?:\/\//g, "")}</option>)}
                </Select>
                <AppButton
                    cssVar="accent"
                    onClick={fetchData}
                >
                    Connect
                </AppButton>
            </div>

            {importedData && <>
                {importedData.length === 0 &&
                    <h2>No data to import</h2>
                }
                {importedData.length > 0 && <>
                    {error
                        ? <>
                            <h2>Error:</h2>
                            <p>{error}</p>
                        </>
                        : <>
                            <div className="column">
                                <div className="row-centered" style={{ gap: "1rem" }}>
                                    <h2>Data </h2>
                                    <AppButton
                                        cssVar="accent"
                                        onClick={async () => {
                                            await fileService.importAndLog(importedData)
                                            setImportedData([])
                                        }}
                                    >
                                        Import all
                                    </AppButton>
                                </div>
                                <div className="column" style={{ gap: "0.3rem" }}>
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
                                </div>
                            </div>
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
function ImportedRow({ data, onImport }: ImportedRowProps) {
    let name = ""
    if (data.type === "theme") name = data.other?.name
    else name = data.name


    return <div className={cn("row-centered", s["import-row"])}>
        <div className={s["import-type"]}>
            {data.type}
        </div>
        <div className="row" style={{ padding: "0 0.5rem" }}>
            {name}
        </div>
        <AppButton
            cssVar="accent"
            style={{ marginLeft: "auto" }}
            onClick={() => onImport(data)}
        >
            Import
        </AppButton>
    </div>
}