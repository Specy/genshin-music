import clc from 'cli-color'
import {execSync} from 'child_process'
import {prepareGameStatic} from './gameStatic.js'

const GAMES = {
    Sky: {id: 'sky'},
    Genshin: {id: 'genshin'},
}
const chosenApp = process.argv[2]

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
        env: {...process.env, PUBLIC_GAME: id},
    })
}

execute()
