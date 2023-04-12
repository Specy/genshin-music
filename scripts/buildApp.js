import fse from 'fs-extra'
import urlJoin from 'url-join'
import clc from "cli-color";
import { execSync } from 'child_process'
const skyPath = './src/appData/sky'
const genshinPath = './src/appData/genshin'
const publicPath = './public'
const chosenApp = process.argv[2]
const date = new Date()
const SW_VERSION = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`
const PATH_NAMES = {
    Sky: "skyMusic",
    Genshin: "genshinMusic"
}
if (!['Genshin', 'Sky', "All"].includes(chosenApp)) {
    console.error('Please specify an app name [Sky / Genshin / All]')
    process.exit(1)
}



async function execute() {
    const toBuild = chosenApp === "All" ? ['Sky', 'Genshin'] : [chosenApp]
    try{
        for (const app of toBuild) {
            const basePath = Boolean(process.argv[3]) ? `/${PATH_NAMES[app]}` : ""
            console.log(clc.bold.yellow(`Building ${app}...`))
            await fse.copy(app === "Sky" ? skyPath : genshinPath, publicPath, { overwrite: true })
            await updateManifest(basePath)
            if (process.platform === 'win32') {
                console.log(clc.italic("Building on windows"))
                execSync(
                    `set NEXT_PUBLIC_APP_NAME=${app}&& set NEXT_PUBLIC_SW_VERSION=${SW_VERSION}&& set BUILD_PATH=./build/${PATH_NAMES[app]}&& set NEXT_PUBLIC_BASE_PATH=${basePath}&& yarn build`,
                    { stdio: 'inherit' }
                )
            } else {
                console.log(clc.italic("Building on Linux"))
                execSync(
                    `NEXT_PUBLIC_APP_NAME=${app} BUILD_PATH=./build/${PATH_NAMES[app]} NEXT_PUBLIC_SW_VERSION=${SW_VERSION} NEXT_PUBLIC_BASE_PATH=${basePath} yarn build`,
                    { stdio: 'inherit' }
                )
            }
            console.log(clc.green(`${app} build complete \n`))
        }
        console.log(clc.bold.green("Build complete \n"))
        process.exit(0)
    }catch(e){
        console.log(clc.red("[Error]: There was an error building"))
        console.error(e)
        process.exit(1)
    }
}

async function updateManifest(basePath){
    try{
        const manifest = await fse.readJson('./public/manifest.json')
        if(manifest.icons) manifest.icons = manifest.icons.map(icon => ({...icon, src: urlJoin(basePath, icon.src)}))
        if(manifest.start_url) manifest.start_url = basePath 
        if(manifest.screenshots) manifest.screenshots = manifest.screenshots.map(screenshot => ({...screenshot, src: urlJoin(basePath,screenshot.src)}))
        console.log(manifest)
        await fse.writeFile('./public/manifest.json', JSON.stringify(manifest, null, 2))
    }catch(e){
        console.log(clc.red("[Error]: There was an error updating the manifest"))
        console.error(e)
        process.exit(1)
    }
}

execute()