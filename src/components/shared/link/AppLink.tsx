import Link, {LinkProps} from "next/link";
import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";


interface AppLinkProps extends LinkProps {

}

export function AppLink({href, children, style, ...props}: MaybeChildren<LinkProps & Stylable>) {
    return <Link
        href={href}
        style={{
            display: "inline-block",
            textDecoration: "underline",
            color: "var(--accent)",
            ...style,
        }}
        {...props}
    >
        {children}
    </Link>
}
