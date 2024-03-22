import {BlogAuthor, BlogMetadata} from "$cmp/pages/blog/types";
import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {MaybeChildren} from "$lib/UtilTypes";
import s from './blog.module.scss'
import {Header} from "$cmp/shared/header/Header";
import {PageMeta} from "$cmp/shared/Miscellaneous/PageMeta";
import Link from "next/link";
import {useEffect, useMemo, useState} from "react";
import {APP_NAME} from "$config";
import {Row} from "$cmp/shared/layout/Row";
import {BlogAuthorRenderer, BlogTagsRenderer} from "$cmp/pages/blog/BlogMetadataRenderers";

interface BaseBlogPostProps {
    metadata: BlogMetadata
    cropped?: boolean
}

export const SpecyAuthor = {
    name: "Specy",
    picture: '/assets/images/specy.png'
} satisfies BlogAuthor


export function BaseBlogPost({metadata, children, cropped = true}: MaybeChildren<BaseBlogPostProps>) {
    useEffect(() => {
        const visited = JSON.parse(localStorage.getItem(APP_NAME + '_visited_blog_posts') ?? '{}')
        visited[metadata.relativeUrl] = true
        localStorage.setItem(APP_NAME + '_visited_blog_posts', JSON.stringify(visited))
    }, [metadata.relativeUrl]);
    const date = useMemo(() => {
        return new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(metadata.createdAt)
    }, [metadata.createdAt])
    return <DefaultPage
        cropped={false}
        style={{
            paddingLeft: 'var(--menu-size)', gap: '1rem', lineHeight: '1.5'
        }}
    >
        <PageMeta
            text={metadata.title}
            description={metadata.description}
            image={metadata.image}
        >
            <meta name={'author'} content={metadata.author?.name ?? "Specy"}/>
            <meta name={'date'} content={metadata.createdAt.toISOString()}/>
            <meta name={'keywords'} content={metadata.tags.join(', ')}/>
        </PageMeta>
        <Row justify={'between'} className={`${s['blog-nav']}`}>
            <Link href={'/blog'}>
                Posts
            </Link>
            <Link href={'/'}>
                Player
            </Link>
            <Link href={'/composer'}>
                Composer
            </Link>
        </Row>
        <div className={`${s["blog-header"]}`}>

            <img
                src={metadata.image ?? ""}
                alt={`${metadata.title} image`}
                style={{objectFit: "cover", width: "100%", height: "100%"}}
            />
            <div className={`${s["blog-image-mask"]}`}/>
            <div className={s['blog-header-content']}>
                <Header
                    className={`${s["blog-title"]}`}
                    style={{padding: "1rem", fontWeight: 'bold', fontSize: '2.5rem'}}
                >

                    {metadata.title}
                </Header>
            </div>
        </div>

        <article
            className={`${s['blog-article']}`}
            style={cropped ? {
                maxWidth: '60rem',
                margin: '0 auto',
                padding: '2rem',
                paddingLeft: 'calc(var(--menu-size) + 2rem)'
            } : {padding: '2rem'}}
        >
            <Row
                align={'center'}
                gap={'2rem'}
                style={{
                    fontSize: '1.2rem',
                    marginBottom: '1rem'
                }}
            >
                {metadata.author &&
                    <BlogAuthorRenderer author={metadata.author}/>
                }
                <div suppressHydrationWarning={true}>
                    {date}
                </div>
                <BlogTagsRenderer tags={metadata.tags} padding={'0.2rem 1rem'}/>
            </Row>

            {children}
        </article>
    </DefaultPage>
}

export function useHasVisitedBlogPost(name: string) {
    const [visited, setVisited] = useState(true)
    useEffect(() => {
        const visited = JSON.parse(localStorage.getItem(APP_NAME + '_visited_blog_posts') ?? '{}')
        setVisited(visited[name] ?? false)
    }, []);
    return visited
}


