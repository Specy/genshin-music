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

