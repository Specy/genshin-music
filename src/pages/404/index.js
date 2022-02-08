import { SimpleMenu } from "components/SimpleMenu";
export default function Error404(){
    return <div className="default-page" style={{justifyContent: 'center', alignItems: 'center'}}>
        <SimpleMenu />
        <div style={{fontSize: '6rem'}}>
            404
        </div>
        <div>
            No page found, open the menu to change page
        </div>
    </div>
}