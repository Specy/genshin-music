import {MaybeChildren, Stylable} from "$lib/UtilTypes";
import s from './blog.module.scss'

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