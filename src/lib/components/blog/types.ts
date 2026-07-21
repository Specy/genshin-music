// Old: src/components/pages/blog/types.ts (verbatim - a plain type-only file, nothing to
// translate).
export type BlogMetadata = {
    title: string,
    tags: string[]
    relativeUrl: string,
    description: string,
    image?: string,
    createdAt: Date,
    author?: BlogAuthor
}

export type BlogAuthor = {
    name: string,
    picture?: string
}
