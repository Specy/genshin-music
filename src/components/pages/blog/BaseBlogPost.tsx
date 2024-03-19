import {BlogMetadata} from "$pages/blog/types";
import {DefaultPage} from "$cmp/Layout/DefaultPage";
import {MaybeChildren} from "$lib/UtilTypes";
import {Separator} from "$cmp/shared/separator/Separator";
import s from './blog.module.scss'
import {Header} from "$cmp/shared/header/Header";
import {Column} from "$cmp/shared/layout/Column";
import {FaChevronLeft} from "react-icons/fa";
import {PageMeta} from "$cmp/Miscellaneous/PageMeta";

interface BaseBlogPostProps {
    metadata: BlogMetadata
    cropped?: boolean
}


export function BaseBlogPost({metadata, children, cropped = true}: MaybeChildren<BaseBlogPostProps>) {
    return <DefaultPage
        cropped={false}
        style={{
            paddingLeft: 'var(--menu-size)', gap: '1rem', lineHeight: '1.6'
        }}
    >
        <PageMeta
            text={metadata.title}
            description={metadata.description}
            image={metadata.image}
        />

        <div className={`${s["blog-header"]}`}>
            <a className={`${s['blog-back']}`} href={'/blog'}>
                <FaChevronLeft/> Go to posts
            </a>
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
        <div
            style={cropped ? {
                maxWidth: '60rem',
                margin: '0 auto',
                padding: '2rem',
                paddingLeft: 'calc(var(--menu-size) + 2rem)'
            } : {padding: '2rem'}}
        >
            {children}
        </div>
    </DefaultPage>
}