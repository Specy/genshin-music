import ZangoDb from "@insertish/zangodb"

export type BaseObject = Object & {
    id: string | null
}

export interface Collection<T extends BaseObject> {
    remove(query: Query<T>): Promise<void>

    removeById(id: string): Promise<void>

    insert(data: T): Promise<void>

    update(query: Query<T>, data: T): Promise<void>

    updateById(id: string, data: T): Promise<void>

    findOne(query: Query<T>): Promise<T | null>

    findOneById(id: string): Promise<T | null>

    find(query: Query<T>): Promise<T[]>
}

export class ZangoCollection<T extends BaseObject> implements Collection<T> {
    private instance: ZangoDb.Collection

    constructor(collection: ZangoDb.Collection) {
        this.instance = collection
    }

    insert(data: T): Promise<void> {
        return this.instance.insert(data)
    }

    update(query: Query<T>, data: T): Promise<void> {
        return this.instance.update(query as Object, data)
    }

    updateById(id: string, data: T): Promise<void> {
        return this.instance.update({id}, data)
    }

    findOne(query: Query<T>): Promise<T | null> {
        return this.instance.findOne(query as Object) as Promise<T | null>
    }

    find(query: Query<T>): Promise<T[]> {
        return this.instance.find(query as Object).toArray() as Promise<T[]>
    }

    findOneById(id: string): Promise<T | null> {
        return this.instance.findOne({id}) as Promise<T | null>
    }

    remove(query: Query<T>): Promise<void> {
        return this.instance.remove(query as Object)
    }

    removeById(id: string): Promise<void> {
        return this.instance.remove({id})
    }
}

// this black magic type excludes all keys from an object which aren't strings, numbers or null
export type Query<T> = Partial<T> & Partial<Record<keyof T, QueryableTypes>>
type QueryableTypes = string | number | null

