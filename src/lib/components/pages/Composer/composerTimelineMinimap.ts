import { game } from '$game';
import type { InstrumentData, NoteColumn } from '$core/Songs/SongClasses';
import {
  computeGridRowLayerStatuses,
  computeGridStrandedRows,
  effectiveTrackPitch,
  gridRowForNumberCached,
} from '$core/Songs/noteIds';
import type { Pitch } from '$core/legacyConfig';

const NOTES_PER_COLUMN = game.notes.perColumn;
const COMPOSER_NOTE_POSITIONS = game.notes.composerPositions;
const TEMPO_CHANGERS = game.composer.tempoChangers;

/**
 * Source-level switches and budgets for the composer timeline minimap.
 *
 * `showSustainTails` is deliberately not a user setting. It is kept here as a quick experiment
 * switch while the denser timeline treatment settles. Generation is split at column boundaries;
 * the count is a hard upper bound even when an IdleDeadline reports a large budget.
 */
export const COMPOSER_TIMELINE_MINIMAP_CONFIG = {
  showSustainTails: true,
  maxColumnsPerIdleSlice: 2048,
  sliceBudgetMs: 12,
  fallbackDelayMs: 8,
} as const;

const VERTICAL_PADDING = 2;
const CURRENT_NOTE_ALPHA = 0.95;
const VISIBLE_NOTE_ALPHA = 0.68;
const STRANDED_ALPHA_FACTOR = 0.45;
const CURRENT_TAIL_ALPHA = 0.5;
const VISIBLE_TAIL_ALPHA = 0.28;

export interface ComposerTimelineMinimapPalette {
  current: number;
  visible: number;
}

export interface ComposerTimelineMinimapInput {
  columns: readonly NoteColumn[];
  instruments: InstrumentData[];
  /** The song's Basepoint — half of what decides a note's row since ADR-0007 (the track's own override is the other half). */
  songPitch: Pitch;
  currentLayer: number;
  width: number;
  height: number;
  palette: ComposerTimelineMinimapPalette;
  showSustainTails?: boolean;
}

/** The tiny drawing surface ComposerRenderer adapts to a detached Pixi Graphics. */
export interface ComposerTimelineMinimapSink {
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    style: { color: number; alpha: number }
  ): void;
}

type MinimapPhase = 'backgrounds' | 'tails' | 'heads' | 'complete';

/**
 * Incremental, Pixi-independent minimap geometry builder.
 *
 * One call draws at most one song column. Tempo backgrounds, tails, and heads are complete passes
 * in that order, so backgrounds stay behind notes and a later column's long tail can never cover an
 * earlier note head. The caller owns scheduling and cancellation; this class owns deterministic
 * drawing progress.
 */
export class ComposerTimelineMinimapBuilder {
  private readonly columnWidth: number;
  private readonly rowHeight: number;
  private readonly showSustainTails: boolean;
  private phase: MinimapPhase;
  private column = 0;

  constructor(
    private readonly input: ComposerTimelineMinimapInput,
    private readonly sink: ComposerTimelineMinimapSink
  ) {
    this.columnWidth = input.columns.length > 0 ? input.width / input.columns.length : input.width;
    this.rowHeight = Math.max(0, input.height - VERTICAL_PADDING * 2) / NOTES_PER_COLUMN;
    this.showSustainTails = input.showSustainTails ?? true;
    this.phase = 'backgrounds';
    if (input.columns.length === 0) this.phase = 'complete';
  }

  /** Draw one column of the current pass. Returns true once the whole bitmap geometry is ready. */
  drawNextColumn(): boolean {
    if (this.phase === 'complete') return true;
    if (this.phase === 'backgrounds') this.drawTempoBackground(this.column);
    else if (this.phase === 'tails') this.drawTails(this.column);
    else this.drawHeads(this.column);

    this.column++;
    if (this.column < this.input.columns.length) return false;
    if (this.phase === 'backgrounds') {
      this.phase = this.showSustainTails ? 'tails' : 'heads';
      this.column = 0;
      return false;
    }
    if (this.phase === 'tails') {
      this.phase = 'heads';
      this.column = 0;
      return false;
    }
    this.phase = 'complete';
    return true;
  }

  private drawTempoBackground(columnIndex: number): void {
    const tempoChanger = this.input.columns[columnIndex].tempoChanger;
    //Tempo 1 uses the ordinary theme/bar background on the notes canvas. Only an actual changer
    //replaces that background with its configured colour, so the minimap follows the same rule.
    if (tempoChanger === 0) return;
    const color = TEMPO_CHANGERS[tempoChanger]?.color;
    if (color === undefined) return;
    this.sink.rect(columnIndex * this.columnWidth, 0, this.columnWidth, this.input.height, {
      color,
      alpha: 1,
    });
  }

  private drawTails(columnIndex: number): void {
    const column = this.input.columns[columnIndex];
    // Visible secondary tracks first, current layer last: coincident tails keep the current layer's
    // stronger colour, matching the head aggregation below.
    this.drawTailsForLayer(column, columnIndex, false);
    this.drawTailsForLayer(column, columnIndex, true);
  }

  private drawTailsForLayer(
    column: NoteColumn,
    columnIndex: number,
    currentLayerPass: boolean
  ): void {
    const tailHeight = Math.max(0.75, this.rowHeight * 0.22);
    for (const note of column.notes) {
      if (note.span <= 1) continue;
      const isCurrent = note.trackIndex === this.input.currentLayer;
      if (isCurrent !== currentLayerPass) continue;
      const instrument = this.input.instruments[note.trackIndex];
      if (!isCurrent && !instrument?.visible) continue;
      //one call for BOTH the row and the strandedness, like the canvas: two lookups could
      //dim a different row from the one the tail is drawn on
      const placement = gridRowForNumberCached(
        instrument?.name ?? '',
        effectiveTrackPitch(instrument, this.input.songPitch),
        note.id
      );
      const row = placement.row;
      if (row === -1) continue;

      const start = columnIndex * this.columnWidth + this.columnWidth * 0.45;
      const end = Math.min(this.input.width, (columnIndex + note.span) * this.columnWidth);
      if (end <= start) continue;
      const y = this.noteY(row) + (this.rowHeight - tailHeight) / 2;
      const stranded = placement.stranded;
      this.sink.rect(start, y, end - start, tailHeight, {
        color: isCurrent ? this.input.palette.current : this.input.palette.visible,
        alpha:
          (isCurrent ? CURRENT_TAIL_ALPHA : VISIBLE_TAIL_ALPHA) *
          (stranded ? STRANDED_ALPHA_FACTOR : 1),
      });
    }
  }

  private drawHeads(columnIndex: number): void {
    const notes = this.input.columns[columnIndex].notes;
    const statuses = computeGridRowLayerStatuses(
      notes,
      this.input.currentLayer,
      this.input.instruments,
      this.input.songPitch
    );
    const strandedRows = computeGridStrandedRows(
      notes,
      this.input.instruments,
      this.input.songPitch
    );
    const width = Math.max(1, this.columnWidth * 0.78);
    const height = Math.max(1, this.rowHeight * 0.62);
    const x = columnIndex * this.columnWidth + (this.columnWidth - width) / 2;

    for (const [row, status] of statuses) {
      if (status === 0) continue;
      const current = (status & 1) !== 0;
      const y = this.noteY(row) + (this.rowHeight - height) / 2;
      this.sink.rect(x, y, width, height, {
        color: current ? this.input.palette.current : this.input.palette.visible,
        alpha:
          (current ? CURRENT_NOTE_ALPHA : VISIBLE_NOTE_ALPHA) *
          (strandedRows.has(row) ? STRANDED_ALPHA_FACTOR : 1),
      });
    }
  }

  private noteY(row: number): number {
    return VERTICAL_PADDING + COMPOSER_NOTE_POSITIONS[row] * this.rowHeight;
  }
}
