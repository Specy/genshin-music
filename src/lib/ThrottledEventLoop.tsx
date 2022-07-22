
type ThrottledEventLoopCallback = (elapsed: number, sinceLast: number) => void


export class ThrottledEventLoop{
    callback: ThrottledEventLoopCallback
    startTime: number
    elapsed: number
    private nextTick = 0
    private maxFps: number
    private maxFpsInterval = 0
    private deltaTime = 0
    private raf: number = 0
    private duration = 0
    constructor(callback: ThrottledEventLoopCallback, maxFps: number){
        this.callback = callback
        this.startTime = 0
        this.elapsed = 0
        this.maxFps = maxFps
        this.maxFpsInterval = 1000 / maxFps
    }
    get fps(){
        return this.maxFps
    }
    changeMaxFps(maxFps: number){
        this.maxFps = maxFps
        this.maxFpsInterval = 1000 / maxFps
    }
    setCallback(callback: ThrottledEventLoopCallback){
        this.callback = callback
    }
    start(duration?: number){
        this.stop()
        this.startTime = Date.now()
        this.nextTick = Date.now()
        this.duration = duration ?? Number.MAX_SAFE_INTEGER
        this.tick()
    }
    stop(){
        cancelAnimationFrame(this.raf)
    }
    tick = () => {
        const currentTime = Date.now()
        this.deltaTime = currentTime - this.nextTick
        if(this.deltaTime >= this.maxFpsInterval){
            this.nextTick = currentTime - (this.deltaTime % this.maxFpsInterval)
            this.callback(this.elapsed, this.deltaTime)
        }
        this.elapsed = currentTime - this.startTime
        if(this.elapsed < this.duration) this.raf = requestAnimationFrame(this.tick)
    }
}


