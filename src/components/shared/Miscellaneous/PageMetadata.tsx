import Head from "next/head";
import {MaybeChildren} from "$lib/utils/UtilTypes";


interface PageMetadataProps {
    text: string
    description?: string
    image?: string
}

export function PageMetadata({text, description, image, children}: MaybeChildren<PageMetadataProps>) {
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