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
import {useMemo, useState} from "react";
import {useHasVisitedBlogPost} from "$cmp/pages/blog/BaseBlogPost";
import {BlogAuthorRenderer, BlogTagsRenderer} from "$cmp/pages/blog/BlogMetadataRenderers";
import {ComboBox, ComboBoxItem, ComboBoxTitle} from "$cmp/Inputs/ComboBox/ComboBox";

const posts = ([
    _midiDeviceMetadata,
    _midiTransposeMetadata,
    _aiTransposeMetadata,
    _playerTutorialMetadata,
    _composerTutorialMetadata
] satisfies BlogMetadata[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

const tags = Array.from(new Set(posts.flatMap(p => p.tags)).values())


export default function Blog() {
    const [selectedTags, setSelectedTags] = useState(() => tags.map(i => ({item: i, selected: false})))
    const filteredPosts = useMemo(() => {
        if(selectedTags.every(t => !t.selected)) return posts
        return posts.filter(p => selectedTags.some(t => t.selected && p.tags.includes(t.item)))
    }, [selectedTags])
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
                <Row justify={'between'} align={'center'}>
                    <Header>
                        Posts
                    </Header>
                    <ComboBox
                        items={selectedTags}
                        title={<ComboBoxTitle>Select tags</ComboBoxTitle>}
                        onChange={setSelectedTags}
                        style={{zIndex: 3}}
                    >
                        {(item, onClick) =>
                            <ComboBoxItem key={item.item} item={item} onClick={onClick}>
                                {item.item}
                            </ComboBoxItem>
                        }
                    </ComboBox>
                </Row>

                <Grid columns={'repeat(2, 1fr)'} gap={'1rem'}>
                    {filteredPosts.map((metadata) => <BlogPost key={metadata.relativeUrl} metadata={metadata}/>)}
                </Grid>
            </Column>
        </Column>
    </DefaultPage>
}


interface BlogPostProps {
    metadata: BlogMetadata
}

function BlogPost({metadata}: BlogPostProps) {
    const visited = useHasVisitedBlogPost(metadata.relativeUrl)
    const date = useMemo(() => {
        return new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(metadata.createdAt)
    }, [metadata.createdAt])
    return <Link
        href={`/blog/posts/${metadata.relativeUrl}`}
    >
        <Card
            className={cn(s['blog-card'], [!visited, s['blog-card-new']])}
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
                {metadata.author &&
                    <div
                        style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem'
                        }}
                    >
                        <BlogAuthorRenderer author={metadata.author} size={'2rem'} noName/>
                    </div>
                }
            </Header>
            <Column padding={'1rem'} style={{paddingTop: '0.5rem'}}>
                {metadata.description}
            </Column>
            <Row justify={'between'} align={'end'} style={{padding: '0.5rem'}} flex1>
                <Row style={{fontSize: '0.8rem'}}>
                    <BlogTagsRenderer
                        tags={metadata.tags}
                    />
                </Row>

                <div suppressHydrationWarning={true}>
                    {date}
                </div>
            </Row>
        </Card>

    </Link>
}

