import {Row} from "$cmp/shared/layout/Row";


export interface BlogImageProps {
    src: string;
    alt: string;
    height?: string
    width?: string
}


export function BlogImage({src, alt, height, width}: BlogImageProps) {
    return <Row justify={'center'}>
        <img
            src={src}
            alt={alt}
            style={{
                maxHeight: height ?? (width ? undefined : 'min(20rem, 70vh)'),
                width: width,
                maxWidth: '100%',
                borderRadius: "0.5rem",
                margin: '2rem 0',
                boxShadow: "0 0 0.5rem 0.5rem rgba(0, 0, 0, 0.1)",
            }}
        />
    </Row>

}