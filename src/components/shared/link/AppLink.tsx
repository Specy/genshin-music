import {AppLink as NavigationAppLink, type AppLinkProps as NavigationAppLinkProps} from "$/app/_navigation/AppLink";
import {Stylable} from "$lib/utils/UtilTypes";

type AppLinkProps = Omit<NavigationAppLinkProps, 'style'> & Stylable;

export function AppLink({href, children, style, ...props}: AppLinkProps) {
    return <NavigationAppLink
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
    </NavigationAppLink>
}
