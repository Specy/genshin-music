import {DefaultPage} from "$cmp/Layout/DefaultPage";
import {APP_NAME} from "$config";
import {BlogMetadata} from "$cmp/pages/blog/types";
import {Card} from "$cmp/shared/layout/Card";
import Link from "next/link";
import {_midiDeviceMetadata} from "$pages/blog/posts/connect-midi-device";
import {Header} from "$cmp/shared/header/Header";
import {Grid} from "$cmp/shared/layout/Grid";
import {Column} from "$cmp/shared/layout/Column";
import s from './blog.module.scss'
import {_aiTransposeMetadata} from "$pages/blog/posts/ai-transpose";
import {_midiTransposeMetadata} from "$pages/blog/posts/midi-transpose";
import {cn} from "$lib/Utilities";
import {_playerTutorialMetadata} from "$pages/blog/posts/how-to-use-player";
import {_composerTutorialMetadata} from "$pages/blog/posts/how-to-use-composer";
import {PageMeta} from "$cmp/Miscellaneous/PageMeta";
import {Row} from "$cmp/shared/layout/Row";
import {useMemo} from "react";

const posts = ([
    _midiDeviceMetadata,
    _midiTransposeMetadata,
    _aiTransposeMetadata,
    _playerTutorialMetadata,
    _composerTutorialMetadata
] satisfies BlogMetadata[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())


export default function Blog() {
    return <DefaultPage>
        <PageMeta
            text={`${APP_NAME} Music Nightly Blog`}
            description={`Welcome to ${APP_NAME} Music Nightly blog! Here there will be written guides, news and info about the app!`}
        />
        <Column gap={'2rem'}>
            <Header style={{fontSize: '2.5rem', textAlign: 'center'}}>
                Welcome to {APP_NAME} Music Nightly blog!
            </Header>

            <Column gap={'1rem'}>
                <Header>
                    Posts
                </Header>
                <Grid columns={'repeat(2, 1fr)'} gap={'1rem'}>
                    {posts.map((metadata, i) => <BlogPost key={i} metadata={metadata}/>)}
                </Grid>
            </Column>
        </Column>
    </DefaultPage>
}


interface BlogPostProps {
    metadata: BlogMetadata
}

function BlogPost({metadata}: BlogPostProps) {
    const isRecent = new Date(metadata.createdAt).getTime() > new Date().getTime() - 1000 * 60 * 60 * 24 * 7
    const date = useMemo(() => {
        return new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(metadata.createdAt)
    }, [metadata.createdAt])
    return <Link
        href={`/blog/posts/${metadata.relativeUrl}`}
    >
        <Card
            className={cn(s['blog-card'], [isRecent, s['blog-card-new']])}
            style={{height: '100%'}}
        >
            <Header type={'h2'} className={`${s['blog-card-title']}`} style={{marginBottom: '-1.5rem'}}>

                <div
                    className={`${s['blog-card-image']}`}
                    style={{backgroundImage: `url(${metadata.image})`}}
                >
                </div>
                <div className={`${s['blog-card-title-content']}`}>
                    {metadata.title}

                </div>
            </Header>
            <Column padding={'1rem'} style={{paddingTop: '0.5rem'}}>
                {metadata.description}
            </Column>
            <Row justify={'end'} align={'end'} style={{padding: '0.2rem 0.5rem'}} flex1>
                <div suppressHydrationWarning={true}>
                {date}

                </div>
            </Row>
        </Card>

    </Link>
}

