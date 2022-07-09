import { IS_TAURI, TAURI } from "appConfig"
import ZangoDb from "zangodb"
import type TauriFs from '@tauri-apps/api/fs';

export type BaseObject = Object & {
    id: string | null
}

export interface Collection<T extends BaseObject>{
    remove(query: Partial<T>): Promise<void>
    removeById(id: string): Promise<void>
    insert(data: T): Promise<void>
    update(query: Partial<T>, data: T): Promise<void>
    updateById(id: string, data: T): Promise<void>
    findOne(query: Partial<T>): Promise<T | null>
    findOneById(id: string): Promise<T | null>
    find(query: Partial<T>): Promise<T[]>
}


export class ZangoCollection<T extends BaseObject> implements Collection<T>{
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
    updateById(id: string, data: T): Promise<void> {
        return this.instance.update({id}, data)
    }
    findOne(query: T): Promise<T | null> {
        return this.instance.findOne(query) as Promise<T | null>
    }
    find(query: T): Promise<T[]> {
        return this.instance.find(query).toArray() as Promise<T[]>
    }
    findOneById(id: string): Promise<T | null> {
        return this.instance.findOne({id})  as Promise<T | null>
    }
    remove(query: T): Promise<void> {
        return this.instance.remove(query)
    }
    removeById(id: string): Promise<void> {
        return this.instance.remove({id})
    }
}

export class TauriCollection<T extends BaseObject> implements Collection<T>{
    private fs: typeof TauriFs = TAURI?.fs
    readonly table: string
    private baseSettings: any
    private initializing: Promise<any> | false
    constructor(tableName: string){
        this.table = tableName
        this.baseSettings = { dir: this.fs.BaseDirectory.App}
        this.initializing = false
        this.init()
    }
    private async init(){
        this.initializing = this.fs.createDir(this.table, {...this.baseSettings, recursive: true})
        await this.initializing
        this.initializing = false
    }
    private async ensureInitialized(){
        if(this.initializing) await this.initializing
    }
    private async getDirAsArray(): Promise<T[]>{
        await this.ensureInitialized()
        const files = await this.fs.readDir(this.table, this.baseSettings)
        const promises = []
        for(const file of files){
            if(file.children) continue
            promises.push(this.fs.readTextFile(`${this.table}/${file.name}`, this.baseSettings))
        }
        return (await Promise.all(promises)).map(text => JSON.parse(text)) as T[]
    }

    async remove(query: Partial<T>): Promise<void> {
        const data = await this.getDirAsArray()
        const toRemove = data.filter(el => this.queryElement(query, el))
        for(const el of toRemove){
            await this.fs.removeFile(`${this.table}/${el.id}.json`, this.baseSettings)
        }
    }
    async removeById(id: string): Promise<void> {
        await this.fs.removeFile(`${this.table}/${id}.json`, this.baseSettings)
    }
    async insert(data: T): Promise<void> {
        await this.fs.writeTextFile(`${this.table}/${data.id}.json`, JSON.stringify(data), this.baseSettings)
    }
    async updateById(id: string, data: T): Promise<void> {
        await this.fs.writeTextFile(`${this.table}/${id}.json`, JSON.stringify(data), this.baseSettings)
    }
    async update(query: Partial<T>, data: T): Promise<void> {
        const objs = await this.getDirAsArray()
        const element = objs.find(el => this.queryElement(query, el))
        if(!element) return
        await this.fs.writeTextFile(`${this.table}/${element.id}.json`, JSON.stringify(data), this.baseSettings)
    }
    async findOne(query: Partial<T>): Promise<T | null> {
        const data = await this.getDirAsArray()
        return data.find(el => this.queryElement(query, el)) || null
    }
    async findOneById(id: string): Promise<T | null> {
        await this.ensureInitialized()
        try{
            const text = await this.fs.readTextFile(`${this.table}/${id}.json`, this.baseSettings)
            const json = JSON.parse(text) as T
            return json
        }catch(e){
            console.error(e)
            return null
        }
    }
    async find(query: Partial<T>): Promise<T[]> {
        const data = await this.getDirAsArray()
        return data.filter(el => this.queryElement(query, el))
    }
    private queryElement(query: Partial<T>, data: T): boolean{
        const entries = Object.entries(query).map(([k,v]) => ({key: k, value: v}))
        for(const entry of entries){
            // @ts-ignore
            if(data[entry.key] !== entry.value) return false
        }
        return true
    }
}
