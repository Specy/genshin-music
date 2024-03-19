import {CSSProperties, ReactNode} from "react";


export type WithChildren<P = {}, C extends ReactNode = ReactNode> = P & { children: C };
export type MaybeChildren<P = {}, C extends ReactNode = ReactNode> = P & { children?: C };

export interface Stylable {
    className?: string
    style?: CSSProperties
}