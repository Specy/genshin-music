

export type VsrgComposerEvents = 
  'ALL' 
| 'colorChange' 
| 'updateKeys' 
| 'updateOrientation' 
| 'snapPointChange'
| 'tracksChange'
| 'songLoad'
export type VsrcComposerEventCallback = {
    callback: (event: VsrgComposerEvents) => void, 
    id: string
}

class VsrgComposerStore{
    listeners: Map<VsrgComposerEvents, VsrcComposerEventCallback[]> = new Map()

    addEventListener(event: VsrgComposerEvents, callback: VsrcComposerEventCallback){
        const exists = this.listeners.has(event)
        if(!exists) this.listeners.set(event, [])
        this.listeners.get(event)!.push(callback)
    }
    removeEventListener(event: VsrgComposerEvents, callback: Partial<VsrcComposerEventCallback>){
        const callbacks = this.listeners.get(event)
        if(!callbacks) return
        const index = callbacks.findIndex(x => x.id === callback.id || x.callback === callback.callback)
        if(index === -1) return
        callbacks.splice(index, 1)
    }
    emitEvent(event: VsrgComposerEvents){
        const callbacks = [...(this.listeners.get(event) ?? []), ...(this.listeners.get('ALL') ?? [])]
        callbacks.forEach(c => c.callback(event))
    }
}

export const vsrgComposerStore = new VsrgComposerStore()