import {BlogAuthor, BlogMetadata} from "$cmp/pages/blog/types";
import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import s from './blog.module.scss'
import {Header} from "$cmp/shared/header/Header";
import {PageMetadata} from "$cmp/shared/Miscellaneous/PageMetadata";
import Link from "next/link";
import {useEffect, useMemo, useState} from "react";
import {APP_NAME, BASE_PATH} from "$config";
import {Row} from "$cmp/shared/layout/Row";
import {BlogAuthorRenderer, BlogTagsRenderer} from "$cmp/pages/blog/BlogMetadataRenderers";
import {useMediaQuery} from "$lib/Hooks/useMediaQuery";
import {useConfig} from "$lib/Hooks/useConfig";

interface BaseBlogPostProps {
    metadata: BlogMetadata
    cropped?: boolean
}

export const SpecyAuthor = {
    name: "Specy",
    picture: BASE_PATH + '/assets/images/specy.png'
} satisfies BlogAuthor


export function BaseBlogPost({metadata, children, cropped = true}: MaybeChildren<BaseBlogPostProps>) {
    const {IS_MOBILE} = useConfig()
    useEffect(() => {
        const visited = JSON.parse(localStorage.getItem(APP_NAME + '_visited_blog_posts') ?? '{}')
        visited[metadata.relativeUrl] = true
        localStorage.setItem(APP_NAME + '_visited_blog_posts', JSON.stringify(visited))
    }, [metadata.relativeUrl]);
    const date = useMemo(() => {
        return new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(metadata.createdAt)
    }, [metadata.createdAt])
    const closeMenu = useMediaQuery("(orientation: portrait)") && IS_MOBILE

    return <DefaultPage
        cropped={false}
        excludeMenu={closeMenu}
        style={{
            paddingLeft: 'var(--menu-size)', gap: '1rem', lineHeight: '1.5'
        }}
    >
        <PageMetadata
            text={metadata.title}
            description={metadata.description}
            image={metadata.image}
        >
            <meta name={'author'} content={metadata.author?.name ?? "Specy"}/>
            <meta name={'date'} content={metadata.createdAt.toISOString()}/>
            <meta name={'keywords'} content={metadata.tags.join(', ')}/>
        </PageMetadata>
        <BlogNavbar style={closeMenu ? {padding: '1rem 1.5rem'} : undefined}>
            <Link href={'/blog'}>
                Posts
            </Link>
            <Link href={'/'}>
                Player
            </Link>
            <Link href={'/composer'}>
                Composer
            </Link>
        </BlogNavbar>
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
                paddingLeft: closeMenu ? '2rem' : 'calc(var(--menu-size) + 2rem)'
            } : {padding: '2rem'}}
        >
            <Row
                align={'center'}
                gap={'2rem'}
                style={{
                    fontSize: '1.2rem',
                    marginBottom: '1rem',
                    flexWrap: 'wrap'
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
    const [visited, setVisited] = useState(false)
    useEffect(() => {
        const visited = JSON.parse(localStorage.getItem(APP_NAME + '_visited_blog_posts') ?? '{}')
        setVisited(visited[name] ?? false)
    }, []);
    return visited
}

export function BlogNavbar({children, className, style}: MaybeChildren<Stylable>) {
    return <Row justify={'between'} style={style} className={`${className} ${s['blog-nav']}`}>
        {children}
    </Row>
}




