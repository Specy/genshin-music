import clc from 'cli-color'
import {execSync} from 'child_process'
import {prepareGameStatic} from './gameStatic.js'

const GAMES = {
    Sky: {id: 'sky', outDir: 'skyMusic'},
    Genshin: {id: 'genshin', outDir: 'genshinMusic'},
}
const chosenApp = process.argv[2]
const date = new Date()
const SW_VERSION = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}`

if (!['Genshin', 'Sky', 'All'].includes(chosenApp)) {
    console.error('Please specify an app name [Sky / Genshin / All]')
    process.exit(1)
}

async function execute() {
    const toBuild = chosenApp === 'All' ? ['Sky', 'Genshin'] : [chosenApp]
    try {
        for (const app of toBuild) {
            const {id, outDir} = GAMES[app]
            // Historical quirk, preserved: NO third argv → base '' (production
            // build:all); ANY third argv (scripts pass "false") → subpath base.
            const basePath = Boolean(process.argv[3]) ? `/${outDir}` : ''
            console.log(clc.bold.yellow(`Building ${app}...`))
            await prepareGameStatic(id, basePath)
            execSync('npm run build', {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    PUBLIC_GAME: id,
                    PUBLIC_SW_VERSION: SW_VERSION,
                    PUBLIC_BASE_PATH: basePath,
                    BUILD_PATH: `./build/${outDir}`,
                },
            })
            console.log(clc.green(`${app} build complete \n`))
        }
        console.log(clc.bold.green('Build complete \n'))
        process.exit(0)
    } catch (e) {
        console.log(clc.red('[Error]: There was an error building'))
        console.error(e)
        process.exit(1)
    }
}

execute()
