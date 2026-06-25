// Registers the pixi.js classes used as @pixi/react JSX elements (<pixiContainer> etc.).
// Import this module for side effect once before rendering any <Application> tree.
import { extend } from '@pixi/react'
import { Container, Graphics, Sprite, Text } from 'pixi.js'

extend({ Container, Graphics, Sprite, Text })
