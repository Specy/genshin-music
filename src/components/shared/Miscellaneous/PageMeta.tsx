import Head from "next/head";
import {MaybeChildren} from "$lib/utils/UtilTypes";


interface PageMetaProps {
    text: string
    description?: string
    image?: string
}

export function PageMeta({text, description, image, children}: MaybeChildren<PageMetaProps>) {
    return <Head>
        <title>{text}</title>
        {description && <>
            <meta name="description" content={description}/>
            <meta property="og:description" content={description}/>
        </>}
        {image && <>
            <meta name="image" content={image}/>
            <meta property="og:image" content={image}/>

        </>}
        {children}
    </Head>
}