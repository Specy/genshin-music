import {Row} from "$cmp/shared/layout/Row";


export interface BlogImageProps {
    src: string;
    alt: string;
    height?: string
}


export function BlogImage({src, alt, height = 'min(20rem, 70vh)'}: BlogImageProps) {
    return <Row justify={'center'}>
        <img
            src={src}
            alt={alt}
            style={{
                height,
                borderRadius: "0.5rem",
                margin: '2rem 0',
                boxShadow: "0 0 0.5rem 0.5rem rgba(0, 0, 0, 0.1)",
            }}
        />
    </Row>

}