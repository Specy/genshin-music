import Head from "next/head";

export function PageMeta({ text, description}: { text: string, description?: string }) {
    return <Head>
        <title>{text}</title>
        {description && <meta name="description" content={description} />}
    </Head>
}