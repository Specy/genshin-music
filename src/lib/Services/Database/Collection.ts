import { TAURI } from "appConfig"
import ZangoDb from "zangodb"


export interface Collection<T extends Object>{
    remove(query: Partial<T>): Promise<void>
    insert(data: T): Promise<void>
    update(query: Partial<T>, data: T): Promise<void>
    findOne(query: Partial<T>): Promise<T | null>
    find(query: Partial<T>): Promise<T[]>
}


export class ZangoCollection<T extends Object> implements Collection<T>{
    private instance: ZangoDb.Collection
    constructor(collection: ZangoDb.Collection){
        this.instance = collection
    }
    insert(data: T): Promise<void> {
        return this.instance.insert(data)
    }
    update(query: T, data: T): Promise<void> {
        return this.instance.update(query, data)
    }
    findOne(query: T): Promise<any> {
        return this.instance.findOne(query)
    }
    find(query: T): Promise<T[]> {
        return this.instance.find(query).toArray() as Promise<T[]>
    }
    remove(query: T): Promise<void> {
        return this.instance.remove(query)
    }
}

export class TauriCollection<T extends Object> implements Collection<T>{
    constructor(){
    }
    remove(query: Partial<T>): Promise<void> {
        throw new Error("Method not implemented.")
    }
    insert(data: T): Promise<void> {
        throw new Error("Method not implemented.")
    }
    update(query: Partial<T>, data: T): Promise<void> {
        throw new Error("Method not implemented.")
    }
    findOne(query: Partial<T>): Promise<T | null> {
        throw new Error("Method not implemented.")
    }
    find(query: Partial<T>): Promise<T[]> {
        throw new Error("Method not implemented.")
    }
}