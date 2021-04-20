import React, { Component } from 'react'
import { Stage, Container, Graphics } from '@inlet/react-pixi';
import "./Composer.css"
const NumOfColumnsPerCanvas = 50
const noteMargin = window.screen.availWidth < 800 ? 2 : 4
const selectedColor = 0x414a59
const noteBorder = window.screen.availWidth < 800 ? 2 : 3
class ComposerCanvas extends Component {
    constructor(props) {
        super(props)
        let width = nearestEven(window.screen.availWidth * 0.7)
        let height = nearestEven(window.screen.availHeight * 0.45)
        this.state = {
            width: width,
            height: height,
            column: {
                width: calcMinColumnWidth(nearestEven(width)),
                height: height
            }
        }
    }
    render() {
        let s = this.state
        let pixiOptions = {
            backgroundColor: 0x495466,
            antialias: true
        }
        const { data, functions } = this.props
        let sizes = this.state.column
        let xPos = (data.selected - NumOfColumnsPerCanvas / 2 + 1) * - sizes.width
        return <div className="canvas-wrapper">
            <Stage
                width={s.width}
                height={s.height}
                options={pixiOptions}
            >
                <Container
                    anchor={[0.5, 0.5]}
                    x={xPos}
                >
                    {data.columns.map((column, i) => {
                        if(!isVisible(i,data.selected)) return null
                        return <Column
                            data={column}
                            index={i}
                            sizes={sizes}
                            click={functions.selectColumn}
                            isSelected={i === data.selected}
                        />
                    })}
                </Container>
            </Stage>
        </div>
    }
}

function Column(props) {
    let { data, index, sizes, click, isSelected, isVisible } = props
    let color = isSelected ? selectedColor : data.color
    function drawBg(g) {
        g.clear()
        g.beginFill(color, 1)
        g.drawRect(0, 0, sizes.width, sizes.height)
        g.endFill()
        g.lineStyle(1, 0x00000, 0.8)
        g.moveTo(sizes.width, 0)
        g.lineTo(sizes.width, sizes.height)
        g.moveTo(0, 0)
        g.lineTo(0, sizes.height)
    }
    let noteHeight = sizes.height / 21 - (noteMargin * 2)
    let noteWidth = sizes.width - (noteMargin * 2)
    function drawNote(g, note) {
        g.clear()
        g.beginFill(note.color, 1)
        g.drawRoundedRect(noteMargin, positions[note.index] * sizes.height / 21, noteWidth, noteHeight, noteBorder)
        g.endFill()
    }
    //index color
    return <Container
        pointerdown={() => click(index)}
        interactive={true}
        x={sizes.width * index}
    >
        <Graphics draw={drawBg} />
        {data.notes.map((note) => {
            return <Graphics draw={(g) => drawNote(g, note)} />
        })}
    </Container>
}
function calcMinColumnWidth(parentWidth) {
    return nearestEven(parentWidth / NumOfColumnsPerCanvas)
}
function nearestEven(num) {
    return 2 * Math.round(num / 2);
}
function isVisible(pos,currentPos){
    let threshold = NumOfColumnsPerCanvas / 2 + 2
    let boundaries = [currentPos - threshold, currentPos + threshold]
    return boundaries[0] < pos && pos < boundaries[1]
}
const positions = [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6]
export default ComposerCanvas