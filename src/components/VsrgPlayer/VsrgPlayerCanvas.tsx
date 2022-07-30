import { ThrottledEventLoop } from "lib/ThrottledEventLoop";
import { Component } from "react";



interface VsrgPlayerCanvasProps{
    isPlaying: boolean
    onTick: (timestamp: number) => void
}
interface VsrgPlayerCanvasState{

}

export class VsrgPlayerCanvas extends Component<VsrgPlayerCanvasProps, VsrgPlayerCanvasState>{
    throttledEventLoop: ThrottledEventLoop = new ThrottledEventLoop(() => { }, 48)

    componentDidMount() {
        this.throttledEventLoop.setCallback(this.handleTick)
        this.throttledEventLoop.start()
    }
    componentWillUnmount() {
        this.throttledEventLoop.stop()
    }
    handleTick =  (elapsed: number, sinceLast: number) => {
        const { isPlaying } = this.props
        if(!isPlaying) return
        this.props.onTick(elapsed)
    }
    render() {
        return <>
            <div className="vsrg-player-canvas">

            </div>
        </>
    }
}