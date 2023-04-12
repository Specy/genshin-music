import { execSync } from 'child_process'
import fse from 'fs-extra'
import clc from "cli-color";
import urlJoin from 'url-join'

const publicPath = './public'
const skyPath = './src/appData/sky'
const genshinPath = './src/appData/genshin'
const chosenApp = process.argv[2]

if (!['Genshin', 'Sky'].includes(chosenApp)) {
    console.error('Please specify an app name [Sky/Genshin]')
    process.exit(1)
}


async function execute() {
    await fse.copy(chosenApp === "Sky" ? skyPath : genshinPath, publicPath, { overwrite: true })
    updateManifest("")
    if (process.platform === 'win32') {
        console.log(clc.yellow.bold("Starting on windows"))
        execSync(`set NEXT_PUBLIC_APP_NAME=${chosenApp}&& yarn start`, { stdio: 'inherit' })
    } else {
        console.log(clc.yellow.bold("Starting on linux"))
        execSync(`NEXT_PUBLIC_APP_NAME=${chosenApp} yarn start`, { stdio: 'inherit' })
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