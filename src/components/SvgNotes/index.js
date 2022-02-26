import crNote from "./sky/cr";
import dmNote from "./sky/dm";
import dmcrNote from "./sky/dmcr";

import doNote from "./genshin/do";
import reNote from "./genshin/re";
import miNote from "./genshin/mi";
import faNote from "./genshin/fa";
import soNote from "./genshin/so";
import laNote from "./genshin/la";
import tiNote from "./genshin/ti";

import { memo } from "react";
const notes = {
    cr: crNote,
    dm: dmNote,
    dmcr: dmcrNote,

    do: doNote,
    re: reNote,
    mi: miNote,
    fa: faNote,
    so: soNote,
    la: laNote,
    ti: tiNote
}

function SvgNote({name,color = 'currentColor'}){
    const NoteComponent = notes[name]
    return <NoteComponent style={{fill: color,stroke: color}}/>
}

export default memo(SvgNote,(p,n) => {
    return p.fill === n.fill
})