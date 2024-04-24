import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import s from './blog.module.scss'
import Link from "next/link";

export function BlogUl({children, ...rest}: MaybeChildren<Stylable>) {
    return <ul {...rest}>
        {children}
    </ul>
}

export function BlogOl({children, className, ...rest}: MaybeChildren<Stylable>) {
    return <ol {...rest} className={`${className} ${s['blog-ol']}`}>
        {children}
    </ol>
}

export function BlogLi({children, ...rest}: MaybeChildren<Stylable>) {
    return <li
        {...rest}
    >
        {children}
    </li>
}


export function BlogP({children, className, ...rest}: MaybeChildren<Stylable>) {
    return <p
        className={`${s['blog-p']} ${className}`}
        {...rest}
    >
        {children}
    </p>
}

export function BlogB({children, className, ...rest}: MaybeChildren<Stylable>) {
    return <b
        className={`${s['blog-b']} ${className}`}
        {...rest}
    >
        {children}
    </b>
}

export function BlogIframe({src, ...rest}: { src: string } & Stylable) {
    return <iframe
        {...rest}
        src={src}
        className={s['blog-iframe']}
    />
}

export function BlogLink({href, children, external,  ...rest}: { href: string, external?: boolean } & MaybeChildren<Stylable>) {
    return <Link
        {...rest}
        href={href}
        target={external ? "_blank" : undefined}
        className={s['blog-link']}
    >
        {children}
    </Link>
}