import crNote from "./sky/cr";
import dmNote from "./sky/dm";
import dmcrNote from "./sky/dmcr";
import doNote from "./genshin/do";
import reNote from "./genshin/re";
import rebNote from "./genshin/reb";
import miNote from "./genshin/mi";
import mibNote from "./genshin/mib";
import faNote from "./genshin/fa";
import soNote from "./genshin/so";
import laNote from "./genshin/la";
import labNote from "./genshin/lab";
import tiNote from "./genshin/ti";
import tibNote from "./genshin/tib";

import React, { memo } from "react";
const noteIconsMap = {
    cr: crNote,
    dm: dmNote,
    dmcr: dmcrNote,
    do: doNote,
    re: reNote,
    reb: rebNote,
    mi: miNote,
    mib: mibNote,
    fa: faNote,
    so: soNote,
    la: laNote,
    lab: labNote,
    ti: tiNote,
    tib: tibNote,
}
export type NoteImage = keyof typeof noteIconsMap;
interface SvgNoteProps {
    name: NoteImage
    color?: string
    fill?: string
    background?: string
}
export interface SvgNoteImageProps {
    style: React.CSSProperties,
    background?: string
}
function SvgNote({ name, color = 'currentColor', background }: SvgNoteProps) {
    const NoteComponent = noteIconsMap[name]
    return NoteComponent ?
        <NoteComponent style={{ fill: color, stroke: color }} background={background} />
        : <>
            "N/A"
        </>
}

export default memo(SvgNote, (p, n) => {
    return p.color === n.color && p.background === n.background && p.name === n.name
})