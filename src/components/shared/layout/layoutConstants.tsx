export type Justify = "start" | "end" | "center" | "between" | "around" | "evenly"

export const justifyMap: Record<Justify, string> = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly'
}