/* https://github.com/iamskok/use-font-face-observer/blob/master/src/index.ts */

import { useState, useEffect } from "react"
import FontFaceObserver from "fontfaceobserver"

/**
 * @typedef FontFace
 * @property {string} family The font-family: Roboto, Inter, Open Sans, etc
 * @property {string|number} weight The font-weight: normal, bold, 800, etc
 * @property {string} style The font-style: normal, italic, oblique
 * @property {string} stretch The font stretch: normal, condensed, expanded, etc
 */
export interface FontFace {
  family: string
  weight?:
    | `light`
    | `normal`
    | `bold`
    | `bolder`
    | `100`
    | `200`
    | `300`
    | `400`
    | `500`
    | `600`
    | `700`
    | `800`
    | `900`
  style?: `normal` | `italic` | `oblique`
  stretch?:
    | `normal`
    | `ultra-condensed`
    | `extra-condensed`
    | `condensed`
    | `semi-condensed`
    | `semi-expanded`
    | `expanded`
    | `extra-expanded`
    | `ultra-expanded`
}

export interface Options {
  testString?: string
  timeout?: number
}

export interface Config {
  showErrors: boolean
}

export function useFontFaceObserver(
  fontFaces: FontFace[] = [],
  { testString, timeout }: Options = {},
  { showErrors }: Config = { showErrors: false }
): boolean {
  const [isResolved, setIsResolved] = useState(false)
  const fontFacesString = JSON.stringify(fontFaces)

  useEffect(() => {
    const promises = JSON.parse(fontFacesString).map(
      ({ family, weight, style, stretch }: FontFace) =>
        new FontFaceObserver(family, {
          weight,
          style,
          stretch,
        }).load(testString, timeout)
    )

    Promise.all(promises)
      .then(() => setIsResolved(true))
      .catch(() => {
        if (showErrors) {
          // eslint-disable-next-line no-console
          console.error(`An error occurred during font loading`)
        }
      })
  }, [fontFacesString, testString, timeout, showErrors])

  return isResolved
}
