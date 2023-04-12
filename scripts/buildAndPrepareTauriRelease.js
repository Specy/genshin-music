//require('dotenv').config()
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import clc from "cli-color";

const [_1, _2, useEnv, app] = process.argv
const version = process.env.VERSION
const changelog = process.env.CHANGELOG

const githubEndpoint = 'https://github.com/Specy/genshin-music/releases/download/{version}/{zip-name}'
const PLATFORM = process.platform
const folders = {
    bundle: './src-tauri/target/release/bundle/',
    windows: './src-tauri/target/release/bundle/msi/',
    windowsRelease: './src-tauri/bundle/windows/',
    macos: './src-tauri/target/release/bundle/macos/',
    macosDmg: './src-tauri/target/release/bundle/dmg/',
    macosRelease: './src-tauri/bundle/macos/',
    linux: './src-tauri/target/release/bundle/appimage/',
    linuxDeb: './src-tauri/target/release/bundle/deb/',
    linuxRelease: './src-tauri/bundle/linux/'
}
if (!['genshin', 'sky', "all"].includes(app?.toLowerCase())) {
    console.error('Please specify an app name [Sky / Genshin / All]')
    process.exit(1)
}
if (version === undefined) {
    console.error('Please specify a version')
    process.exit(1)
}
if (version.startsWith("v")) {
    console.error("Please don't use the v in the version number")
    process.exit(1)
}
if (changelog === undefined) {
    console.error('Please specify a changelog')
    process.exit(1)
}
const platformKey = {
    "win32": "windows-x86_64",
    "darwin": "darwin-x86_64",
    "linux": "linux-x86_64"
}
const apps = app === "all" ? ["sky", "genshin"] : [app]
function buildApp(app){
    const yarn = PLATFORM === "win32" ? "yarn.cmd" : "yarn"
    return new Promise((res, rej) => {
       const child =  spawn(yarn,
            [`build-tauri:${app}${useEnv === 'false' ? "-no-env" : ""}`],
            {
                stdio: 'inherit',   
                cwd: process.cwd()
            }
        )
        child.on('close', (code) => {
            if(code === 0){
               return res()
            }
            console.log(code)
            rej()
        })
        child.on('error', (error) => {
            console.error(error)
            rej()
        })
    })
}

async function run() {
    await fs.rm(folders.bundle, { recursive: true }).catch(() => console.warn("[Warning]: Could not delete bundle folder"))
    try {
        for (const app of apps) {
            const appUpdate = await fs.readFile(`./src-tauri/tauri-${app}.update.json`, 'utf8').then(JSON.parse)
            const appConfig = await fs.readFile(`./src-tauri/tauri-${app}.conf.json`, 'utf8').then(JSON.parse)
            appConfig.package.version = version
            await fs.writeFile(`./src-tauri/tauri-${app}.conf.json`, JSON.stringify(appConfig, null, 2))
            console.log(`[Log]: Building react and tauri of ${app}...`)
            await fs.rm(folders.bundle, { recursive: true }).catch(() => console.warn("[Warning]: Could not delete bundle folder"))   
            await buildApp(app)
            console.log(clc.green(`[Status]: Build of ${app} complete \n`))
            //on windows
            if (PLATFORM === 'win32') {
                const buildFiles = await fs.readdir(folders.windows)
                //removes all spaces from the paths
                for (const file of buildFiles) {
                    const newName = "windows-" + file.replaceAll(" ", "_")
                    await fs.rename(`${folders.windows}${file}`, `${folders.windows}${newName}`)
                }
                //finds the zip file for the update
                const renamedFiles = (await fs.readdir(folders.windows)).filter(f => f.toLowerCase().includes(app))
                const buildZip = renamedFiles.find(e => e.endsWith('.msi.zip'))
                if (!buildZip) {
                    console.error(clc.red(`[Error]: No Zip/Tar found for ${app}`))
                    process.exit(1)
                }
                //finds the build signature for the update
                const buildSignatureFile = renamedFiles.find(e => e.endsWith('.sig'))
                const buildSignature = await fs.readFile(`${folders.windows}${buildSignatureFile}`, 'utf8')
                //writes the update info to the update json
                appUpdate.version = `v${version}`
                appUpdate.notes = changelog
                appUpdate.platforms[platformKey[PLATFORM]] = {
                    url: githubEndpoint
                        .replace("{version}", 'v' + version)
                        .replace("{zip-name}", buildZip),
                    signature: buildSignature
                }
                //saves the results to both the folder of the build data and updates the repository one
                await fs.writeFile(`./src-tauri/tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))
                //copies all the built files to the final release folder
                await fs.mkdir(folders.windowsRelease, { recursive: true })
                await fs.writeFile(`${folders.windowsRelease}tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))
                for (const file of (await fs.readdir(folders.windows)).filter(f => [".msi.zip", '.msi', '.json'].some(e => f.endsWith(e)))) {
                    await fs.copyFile(`${folders.windows}${file}`, `${folders.windowsRelease}${file}`,)
                    await fs.rm(`${folders.windows}${file}`)
                }
            }
            //on mac
            if (PLATFORM === 'darwin') {
                const buildFiles = await fs.readdir(folders.macos)
                const dmgFiles = await fs.readdir(folders.macosDmg)
                //removes all spaces from the paths
                for (const file of buildFiles) {
                    const newName = "macos-" + file.replaceAll(" ", "_")
                    await fs.rename(`${folders.macos}${file}`, `${folders.macos}${newName}`)
                }
                for (const file of dmgFiles) {
                    const newName = "macos-" + file.replaceAll(" ", "_")
                    await fs.rename(`${folders.macosDmg}${file}`, `${folders.macosDmg}${newName}`)
                }
                //finds the zip file for the update
                const renamedFiles = (await fs.readdir(folders.macos)).filter(f => f.toLowerCase().includes(app))
                const buildZip = renamedFiles.find(e => e.endsWith('.tar.gz'))
                if (!buildZip) {
                    console.error(clc.red(`[Error]: No tar.gz found for ${app}`))
                    process.exit(1)
                }
                //finds the build signature for the update
                const buildSignatureFile = renamedFiles.find(e => e.endsWith('.sig'))
                const buildSignature = await fs.readFile(`${folders.macos}${buildSignatureFile}`, 'utf8')
                //writes the update info to the update json
                appUpdate.version = `v${version}`
                appUpdate.notes = changelog
                appUpdate.platforms[platformKey[PLATFORM]] = {
                    url: githubEndpoint
                        .replace("{version}", 'v' + version)
                        .replace("{zip-name}", buildZip),
                    signature: buildSignature
                }
                //saves the results to both the folder of the build data and updates the repository one
                await fs.writeFile(`./src-tauri/tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))
                //copies all the update files 
                await fs.mkdir(folders.macosRelease, { recursive: true })
                await fs.writeFile(`${folders.macosRelease}tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))

                for (const file of (await fs.readdir(folders.macos)).filter(f => [".tar.gz", '.json'].some(e => f.endsWith(e)))) {
                    await fs.copyFile(`${folders.macos}${file}`, `${folders.macosRelease}${file}`,)
                    await fs.rm(`${folders.macos}${file}`)
                }
                //copies all the install files
                for (const file of (await fs.readdir(folders.macosDmg)).filter(f => f.endsWith('.dmg'))) {
                    await fs.copyFile(`${folders.macosDmg}${file}`, `${folders.macosRelease}${file}`)
                    await fs.rm(`${folders.macosDmg}${file}`)
                }
            }

            //on linux
            if (PLATFORM === 'linux') {
                const buildFiles = await fs.readdir(folders.linux)
                const dmgFiles = await fs.readdir(folders.linuxDeb)
                //removes all spaces from the paths
                for (const file of buildFiles) {
                    const newName = "linux-" + file.replaceAll(" ", "_")
                    await fs.rename(`${folders.linux}${file}`, `${folders.linux}${newName}`)
                }
                for (const file of dmgFiles) {
                    const newName = "linux-" + file.replaceAll(" ", "_")
                    await fs.rename(`${folders.linuxDeb}${file}`, `${folders.linuxDeb}${newName}`)
                }
                //finds the zip file for the update
                const renamedFiles = (await fs.readdir(folders.linux)).filter(f => f.toLowerCase().includes(app))
                const files = await fs.readdir(folders.linux)
                files.forEach(f => {
                    console.log(f.toLowerCase().includes(app), f.toLowerCase(), app)
                })
                const buildZip = renamedFiles.find(e => e.endsWith('.tar.gz'))
                if (!buildZip) {
                    console.error(clc.red(`[Error]: No tar.gz found for ${app}`))
                    process.exit(1)
                }
                //finds the build signature for the update
                const buildSignatureFile = renamedFiles.find(e => e.endsWith('.sig'))
                const buildSignature = await fs.readFile(`${folders.linux}${buildSignatureFile}`, 'utf8')
                //writes the update info to the update json
                appUpdate.version = `v${version}`
                appUpdate.notes = changelog
                appUpdate.platforms[platformKey[PLATFORM]] = {
                    url: githubEndpoint
                        .replace("{version}", 'v' + version)
                        .replace("{zip-name}", buildZip),
                    signature: buildSignature
                }
                //saves the results to both the folder of the build data and updates the repository one
                await fs.writeFile(`./src-tauri/tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))
                //copies all the update files 
                await fs.mkdir(folders.linuxRelease, { recursive: true })
                await fs.writeFile(`${folders.linuxRelease}tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))

                for (const file of (await fs.readdir(folders.linux)).filter(f => [".tar.gz", '.json'].some(e => f.endsWith(e)))) {
                    await fs.copyFile(`${folders.linux}${file}`, `${folders.linuxRelease}${file}`,)
                    await fs.rm(`${folders.linux}${file}`)
                }
                //copies all the install files
                for (const file of (await fs.readdir(folders.linuxDeb)).filter(f => f.endsWith('.deb'))) {
                    await fs.copyFile(`${folders.linuxDeb}${file}`, `${folders.linuxRelease}${file}`)
                    await fs.rm(`${folders.linuxDeb}${file}`)
                }
            }
        }
        console.log(clc.green("[Log]: Build complete!"))
    } catch (e) {
        console.log(clc.red("[Error]: There was an error building"))
        console.error(e)
        process.exit(1)
    }
}

run()