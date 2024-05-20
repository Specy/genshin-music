import {BlogAuthor} from "$cmp/pages/blog/types";
import {Row} from "$cmp/shared/layout/Row";
import {BASE_PATH} from "$config";

interface BlogAuthorProps {
    author: BlogAuthor
    size?: string
    noName?: boolean
}

export function BlogAuthorRenderer({author, size = '2.5rem', noName = false}: BlogAuthorProps) {
    return <Row
        gap={'0.5rem'}
        align={'center'}
        style={{flexWrap: "wrap"}}
    >
        <img
            src={author.picture ?? `${BASE_PATH}/assets/images/specy.png`}
            alt={`${author.name} picture`}
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                border: "solid 0.1rem var(--secondary)"
            }}
        />
        {!noName &&
            <div>
                {author.name}
            </div>
        }
    </Row>
}

interface BlogTagsProps {
    tags: string[]
    padding?: string
}

export function BlogTagsRenderer({tags, padding = '0.2rem 0.5rem'}: BlogTagsProps) {
    return <div className={'row'} style={{flexWrap: 'wrap'}}>
        {tags.map(t =>
            <div
                key={t}
                style={{
                    padding,
                    borderRadius: '2rem',
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--secondary-text)',
                }}
            >
                {t}
            </div>
        )}
    </div>
}