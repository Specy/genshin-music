import { HelpTab } from "components/HelpTab"
import { SimpleMenu } from "components/SimpleMenu"

export default function Help(){
    return <div className="default-page">
        <SimpleMenu/>
        <div>
            <div style={{fontSize: '2rem', margin: '1rem 0'}}>
                Info about the app
            </div>
            <div style={{marginLeft: '1rem'}}>
                In this page you will find an explaination for what all the buttons in the app do and
                how to use them.
                <br/><br/>
                If you Have issues, bugs, or suggestions, please join our 
                <a href="https://discord.gg/Arsf65YYHq" style={{color: 'var(--accent)'}}>
                <>&nbsp;</> Discord server
                </a>
                . <br/>
            </div>
            <HelpTab />
        </div>
    </div>
}