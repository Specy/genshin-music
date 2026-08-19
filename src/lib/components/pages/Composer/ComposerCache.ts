import { game } from '$game';
import { COMPOSER_CACHE_DATA } from '$core/legacyConfig';
import Color, { type ColorInstance } from 'color';
import { Application, Graphics, Rectangle, Texture } from 'pixi.js';
import { NoteLayer } from '$core/Songs/Layer';

const { layersCombination, breakpoints } = COMPOSER_CACHE_DATA;
const NOTES_PER_COLUMN = game.notes.perColumn;
const TEMPO_CHANGERS = game.composer.tempoChangers;
const horizontalLineBreak = game.notes.perColumn / 3;

interface ComposerCacheProps {
  width: number;
  height: number;
  margin: number;
  timelineHeight: number;
  app: Application;
  colors: {
    accent: ColorInstance;
    mainLayer: ColorInstance;
    secondLayer: ColorInstance;
    /**
     * The ink an OFF-SCALE hint is drawn in ON TOP OF a filled note (see drawAccidental): the
     * theme's own readable-text answer for `composer_main_layer`, so the glyph reads in both a
     * light and a dark theme without this file deciding what "contrast" means. A note with no
     * main-layer fill draws the hint in `secondLayer` instead - the colour that instrument icon
     * is already legible in over the bar background.
     */
    accidental: ColorInstance;
    bars: typeof COMPOSER_CACHE_DATA.standards;
  };
}

/**
 * OFF-SCALE HINTS (ADR-0007 / spec §11 D) are BAKED INTO THE NOTE TEXTURE, one variant per layer
 * combination per accidental, and this is the key that names them.
 *
 * Not a second sprite over the note: a column view's children are a fixed prefix plus note sprites
 * grown on demand (see ColumnView), pixi draws them in array order, and an overlay pool would have
 * to be kept last in that order for the life of the pool. Baking keeps the hint part of the note's
 * own paint - one sprite per row, unchanged child order, no invalidation channel of its own - which
 * is the NoteColumn.version repaint contract's whole requirement: the hint is a function of the same
 * (notes, instruments, Basepoint) the sprite already is.
 */
export function noteTextureKey(layerStatus: number, accidental: -1 | 0 | 1): string {
  if (accidental === 0) return `${layerStatus}`;
  return `${layerStatus}${accidental < 0 ? 'b' : '#'}`;
}

export type ComposerCacheData = {
  columns: Texture[];
  notes: {
    [key in string]: Texture;
  };
  standard: Texture[];
  columnsLarger: Texture[];
  standardLarger: Texture[];
  breakpoints: Texture[];
};

export class ComposerCache {
  width: number;
  height: number;
  cache: ComposerCacheData;
  timelineHeight: number;
  margin: number;
  noteWidth: number;
  noteHeight: number;
  app: Application | null;
  colors: {
    accent: ColorInstance;
    mainLayer: ColorInstance;
    secondLayer: ColorInstance;
    accidental: ColorInstance;
    bars: { color: number }[];
  };

  constructor({ width, height, margin = 4, timelineHeight = 30, app, colors }: ComposerCacheProps) {
    this.cache = {
      columns: [],
      notes: {},
      standard: [],
      columnsLarger: [],
      standardLarger: [],
      breakpoints: [],
    };
    this.width = width;
    this.height = height;
    this.timelineHeight = timelineHeight;
    this.margin = margin;
    this.noteWidth = this.width;
    this.noteHeight = this.height / NOTES_PER_COLUMN;
    this.colors = colors;
    this.app = app;
    this.generate();
  }

  destroy = () => {
    this.cache.columns.forEach((e) => e.destroy(true));
    this.cache.standard.forEach((e) => e.destroy(true));
    this.cache.columnsLarger.forEach((e) => e.destroy(true));
    this.cache.standardLarger.forEach((e) => e.destroy(true));
    this.cache.breakpoints.forEach((e) => e.destroy(true));
    Object.values(this.cache.notes).forEach((e) => e.destroy(true));
    this.app = null;
  };
  generate = () => {
    TEMPO_CHANGERS.forEach((tempoChanger) => {
      const texture = this.drawColumn(tempoChanger, 1);
      if (texture) this.cache.columns.push(texture);
    });
    this.colors.bars.forEach((standardColumn) => {
      const texture = this.drawColumn(standardColumn, 1);
      if (texture) this.cache.standard.push(texture);
    });
    this.colors.bars.forEach((standardColumn) => {
      const texture = this.drawColumn(standardColumn, 3);
      if (texture) this.cache.standardLarger.push(texture);
    });
    layersCombination.forEach((note) => {
      //three variants of every note icon: the plain one, and the two an OFF-SCALE strand takes
      //(see noteTextureKey). The accidental is part of the icon, so it costs no extra sprite and
      //no extra repaint - only these textures, built once per cache generation like the rest.
      ([0, 1, -1] as const).forEach((accidental) => {
        const texture = this.drawNote(note, accidental);
        if (texture) this.cache.notes[noteTextureKey(note, accidental)] = texture;
      });
    });
    TEMPO_CHANGERS.forEach((tempoChanger) => {
      const texture = this.drawColumn(tempoChanger, 2);
      if (texture) this.cache.columnsLarger.push(texture);
    });
    breakpoints.forEach((breakpoint) => {
      const g = new Graphics();
      const size = this.timelineHeight / 6;
      if (breakpoint.type === 'short') {
        g.circle(size, this.timelineHeight / 2, size).fill(this.colors.accent.rgb().rgbNumber());
        // THE SAME renderer as every other texture here, now that the mini-timeline shares the notes
        // canvas. The split existed only because there were two: generateTexture returns a
        // RenderTexture whose source has `uploadMethodId: 'unknown'`, so binding one in a DIFFERENT
        // renderer falls through to _initEmptyTexture2D and draws blank - a marker rendered on the
        // notes Application and drawn on the timeline one was invisible.
        if (!this.app) return;
        const texture = this.app.renderer.generateTexture({
          target: g,
          resolution: 2,
          frame: new Rectangle(0, 0, size * 2, this.timelineHeight),
          textureSourceOptions: { scaleMode: 'linear' },
        });
        this.cache.breakpoints.push(texture);
        g.destroy(true);
      } else {
        g.moveTo(0, this.height)
          .lineTo(this.noteWidth / 2, this.height)
          .lineTo(0, this.height - this.noteHeight)
          .fill(this.colors.accent.rgb().rgbNumber());
        g.moveTo(this.width, this.height)
          .lineTo(this.noteWidth / 2, this.height)
          .lineTo(this.width, this.height - this.noteHeight)
          .fill(this.colors.accent.rgb().rgbNumber());
        g.moveTo(0, 0)
          .lineTo(this.noteWidth / 2, 0)
          .lineTo(0, this.noteHeight)
          .fill(this.colors.accent.rgb().rgbNumber());
        g.moveTo(this.width, 0)
          .lineTo(this.noteWidth / 2, 0)
          .lineTo(this.width, this.noteHeight)
          .fill(this.colors.accent.rgb().rgbNumber());
        if (!this.app) return;
        const texture = this.app.renderer.generateTexture({
          target: g,
          resolution: 2,
          textureSourceOptions: { scaleMode: 'linear' },
        });
        this.cache.breakpoints.push(texture);
        g.destroy(true);
      }
    });
  };

  /**
   * One note icon: the layer combination's own marks, plus the OFF-SCALE hint when this variant
   * carries one. Split out of generate() when the hint arrived, so the three variants are one
   * drawing with one extra step rather than three drawings that have to be kept in step.
   */
  private drawNote = (note: number, accidental: -1 | 0 | 1): Texture | undefined => {
    const noteWidth = this.noteWidth;
    const noteHeight = this.noteHeight;
    const radius = this.noteWidth > 20 ? 3 : 2;
    const layer = new NoteLayer(note);
    const g = new Graphics();
    if (layer.test(0)) {
      //layer 1
      g.roundRect(
        this.margin / 2,
        this.margin / 2,
        noteWidth - this.margin,
        noteHeight - this.margin,
        radius
      )
        .fill(new Color(this.colors.mainLayer).rgb().rgbNumber())
        .stroke({ width: 1, color: new Color(this.colors.mainLayer).rgb().rgbNumber() });
    }
    if (layer.test(1)) {
      //layer 2
      const strokeWidth = this.margin === 4 ? 3 : 2;
      g.roundRect(
        this.margin / 2,
        this.margin / 2,
        noteWidth - this.margin,
        noteHeight - this.margin,
        radius
      ).stroke({
        width: strokeWidth,
        color: new Color(this.colors.secondLayer).rgb().rgbNumber(),
      });
    }
    if (layer.test(2)) {
      //layer 3
      g.circle(noteWidth / 2, noteHeight / 2, noteHeight / 3 - 0.5)
        .fill(new Color(this.colors.secondLayer).rgb().rgbNumber())
        .stroke({ width: 1, color: new Color(this.colors.secondLayer).rgb().rgbNumber() });
    }

    if (layer.test(3)) {
      //layer 4
      const lineWidth = this.margin === 4 ? 3 : 2;
      g.moveTo(this.margin / 2, noteHeight / 2)
        .lineTo(noteWidth - this.margin / 2, noteHeight / 2)
        .stroke({
          width: lineWidth,
          color: new Color(this.colors.secondLayer).darken(0.15).rgb().rgbNumber(),
        });
    }
    if (accidental !== 0) {
      //ON TOP of every layer mark, so the hint is never hidden under the circle or the line
      //icon of a track drawn after it
      this.drawAccidental(
        g,
        accidental,
        //the ink that reads where the glyph actually lands: over the main layer's FILL when
        //there is one, over the bar background otherwise
        layer.test(0)
          ? new Color(this.colors.accidental).rgb().rgbNumber()
          : new Color(this.colors.secondLayer).rgb().rgbNumber()
      );
    }
    if (!this.app) return undefined;
    const texture = this.app.renderer.generateTexture({
      target: g,
      resolution: 2,
      frame: new Rectangle(0, 0, this.noteWidth, this.noteHeight),
      textureSourceOptions: { scaleMode: 'linear' },
    });
    g.destroy(true);
    return texture;
  };

  /**
   * THE OFF-SCALE HINT: a ♯ or a ♭ in the note icon's trailing corner, saying that this note's
   * Note Number falls BETWEEN two Song-Grid rows and is drawn on the nearest one (spec §4's grid-row
   * rule). Without it an off-scale note is indistinguishable from a note the track's instrument
   * merely cannot voice - both are dimmed strands on a canonical row.
   *
   * SIGN ONLY, no magnitude, and that is a decision rather than a shortcut. Every off-scale number
   * INSIDE the grid's span is exactly one semitone from its row (the grid is a diatonic ladder), so
   * a magnitude would read "1" on every note a user can actually produce; the only numbers further
   * out are ones that fell off the ends of the grid entirely, where the distance is an octave-plus
   * and a digit that size is unreadable at this glyph's height anyway.
   *
   * Drawn from line segments alone - no curves, no text. A pixi Text would need a font this canvas
   * does not otherwise load, and the bowl of a ♭ at ~12px is two strokes either way.
   */
  private drawAccidental = (g: Graphics, accidental: -1 | 1, color: number) => {
    //a fraction of the icon, so it scales with the canvas (which is viewport-derived) instead of
    //carrying a pixel constant that is right at one window size
    const height = (this.noteHeight - this.margin) * 0.62;
    const width = Math.min(height * 0.62, (this.noteWidth - this.margin) * 0.28);
    if (height <= 0 || width <= 0) return;
    const x = this.noteWidth - this.margin / 2 - Math.max(1.5, width * 0.35) - width;
    const y = (this.noteHeight - height) / 2;
    const stroke = { width: Math.max(1, height * 0.1), color, alpha: 1 };
    if (accidental > 0) {
      //♯: two verticals crossed by two rising bars
      const left = x + width * 0.3;
      const right = x + width * 0.72;
      g.moveTo(left, y + height * 0.08).lineTo(left, y + height * 0.92);
      g.moveTo(right, y + height * 0.08).lineTo(right, y + height * 0.92);
      g.moveTo(x, y + height * 0.44).lineTo(x + width, y + height * 0.32);
      g.moveTo(x, y + height * 0.72).lineTo(x + width, y + height * 0.6);
      g.stroke(stroke);
      return;
    }
    //♭: a full-height stem with a bowl hung off its lower half
    const stem = x + width * 0.28;
    g.moveTo(stem, y).lineTo(stem, y + height);
    g.moveTo(stem, y + height * 0.5)
      .lineTo(x + width, y + height * 0.72)
      .lineTo(stem, y + height);
    g.stroke(stroke);
  };

  drawColumn = (data: { color: number }, borderWidth: number) => {
    const g = new Graphics();
    g.rect(0, 0, this.width, this.height).fill(data.color);
    g.moveTo(this.width, 0)
      .lineTo(this.width, this.height)
      .stroke({ width: borderWidth, color: 0x333333 });
    const linesMid: Array<[number, number, number, number]> = [];
    for (let i = 1; i < 3; i++) {
      const y = this.noteHeight * horizontalLineBreak * i;
      linesMid.push([0, y, this.width, y]);
    }
    for (const [x1, y1, x2, y2] of linesMid) {
      g.moveTo(x1, y1).lineTo(x2, y2);
    }
    g.stroke({ width: 1, color: 0x333333 });
    if (!this.app) return;
    const texture = this.app.renderer.generateTexture({
      target: g,
      resolution: window?.devicePixelRatio || 1,
      frame: new Rectangle(0, 0, this.width, this.height),
      textureSourceOptions: { scaleMode: 'linear' },
    });
    g.destroy(true);
    return texture;
  };
}
