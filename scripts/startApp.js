import clc from 'cli-color'
import {execSync} from 'child_process'
import {prepareGameStatic} from './gameStatic.js'

const GAMES = {
    Sky: {id: 'sky'},
    Genshin: {id: 'genshin'},
}
const chosenApp = process.argv[2]
const date = new Date()
// Phase 5 Task 1: src/service-worker.ts reads PUBLIC_SW_VERSION via `$env/static/public`,
// which is a hard build error if the name is absent from process.env at all — unlike
// scripts/buildApp.js (which this mirrors), a missing value here can't just "quietly
// interpolate as undefined" the way old's raw env read did, so dev mode needs a real value
// set too, not only production builds.
const SW_VERSION = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}`

if (!['Genshin', 'Sky'].includes(chosenApp)) {
    console.error('Please specify an app name [Sky/Genshin]')
    process.exit(1)
}

async function execute() {
    const {id} = GAMES[chosenApp]
    await prepareGameStatic(id, '')
    console.log(clc.yellow.bold(`Starting ${chosenApp} dev server`))
    execSync('npm run dev', {
        stdio: 'inherit',
        env: {...process.env, PUBLIC_GAME: id, PUBLIC_SW_VERSION: SW_VERSION},
    })
}

execute()
