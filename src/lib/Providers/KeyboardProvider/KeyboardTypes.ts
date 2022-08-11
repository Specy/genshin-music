export type KeyboardActionCode = "Backspace" | "Tab" | "Enter" | "ShiftLeft" | "ShiftRight" | "ControlLeft" | "ControlRight" | "AltLeft" | "AltRight" | "Pause" | "CapsLock" | "Escape" | "Space" | "PageUp" | "PageDown" | "End" | "Home" | "ArrowLeft" | "ArrowUp" | "ArrowRight" | "ArrowDown" | "PrintScreen" | "Insert" | "Delete" | "MetaLeft" | "MetaRight" | "ContextMenu" | "NumLock" | "ScrollLock"
export type KeyboardFunctionKey = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12' | 'F13' | 'F14' | 'F15' | 'F16' | 'F17' | 'F18' | 'F19' | 'F20' | 'F21' | 'F22' | 'F23' | 'F24'
export type KeyboardNumberCode = 'Digit0' | 'Digit1' | 'Digit2' | 'Digit3' | 'Digit4' | 'Digit5' | 'Digit6' | 'Digit7' | 'Digit8' | 'Digit9'
export type KeyboardLetterCode = "KeyA" | "KeyB" | "KeyC" | "KeyD" | "KeyE" | "KeyF" | "KeyG" | "KeyH" | "KeyI" | "KeyJ" | "KeyK" | "KeyL" | "KeyM" | "KeyN" | "KeyO" | "KeyP" | "KeyQ" | "KeyR" | "KeyS" | "KeyT" | "KeyU" | "KeyV" | "KeyW" | "KeyX" | "KeyY" | "KeyZ" 
export type KeyboardNumpad = "Numpad0" | "Numpad1" | "Numpad2" | "Numpad3" | "Numpad4" | "Numpad5" | "Numpad6" | "Numpad7" | "Numpad8" | "Numpad9" | "NumpadMultiply" | "NumpadAdd" | "NumpadSubtract" | "NumpadDecimal" | "NumpadDivide"
export type KeyboardSpecialChars = "Semicolon" | "Equal" | "Comma" | "Minus" | "Period" | "Slash" | "Backquote" | "BracketLeft" | "Backslash" | "BracketRight" | "Quote"

export type KeyboardNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type KeyboardLetter = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z"

export type KeyboardCode =  KeyboardFunctionKey | KeyboardNumberCode | KeyboardLetterCode | KeyboardNumpad | KeyboardSpecialChars | KeyboardActionCode