// The letter a finished run is worth. Tallies in, letter out - the end-of-song panel renders it and
// the tests pin it without either of them owning the arithmetic, and nothing here is reactive.
//
// WHY NOT THE RUNNING SCORE: vsrgPlayerStore's `score` is combo-multiplied (each hit pays its base
// value TIMES the combo it lands on), so it grows faster than the chart is long and says nothing on
// its own about how well a run went - the same play is worth four times as much on a chart twice
// the length. A grade has to be a ratio, and the judgment tallies are the only length-independent
// record the store keeps.
import type { VsrgPlayerHitType } from './VsrgPlayerStore.svelte';

export type VsrgGrade = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Just the judgment counters of a run. `VsrgPlayerScore` satisfies this structurally. */
export type VsrgHitTally = Record<VsrgPlayerHitType, number>;

/**
 * What each judgment is worth toward the accuracy ratio, 1 being full credit.
 *
 * Deliberately NOT baseScoreMap's 300/200/100/50/25/0 normalized: that map ranks hits for SCORING,
 * where `amazing` should pay half again what `perfect` does. Reused here, a run of nothing but
 * clean `perfect`s would come out at 67% - a C for a run that never missed a note.
 *
 * `perfect` therefore ties `amazing` at full credit, which also keeps holds honest: a held note
 * pays out a `perfect` every 300ms for as long as it is held (VsrgPlayerRenderer), so those ticks
 * are the chart's clock rather than the player's precision, and any weight under 1 would cap a
 * hold-heavy chart at a grade nobody could reach by playing it well. The two top tiers are still
 * told apart everywhere it matters - by the score, and by the tally rows beside the grade.
 *
 * The rest fall off steeply rather than linearly: a `good` is a press that only just registered at
 * all, and a run made of them should read as a run that barely held together.
 */
const ACCURACY_WEIGHTS: Record<VsrgPlayerHitType, number> = {
  amazing: 1,
  perfect: 1,
  great: 0.65,
  good: 0.3,
  bad: 0.1,
  miss: 0,
};

/**
 * The letters as accuracy floors, best first - the first floor a run clears is its grade.
 *
 * Stated rather than fitted, for the reason vsrgRating.ts gives about its own anchors: there is no
 * corpus of played runs to fit against. The spacing follows what the weights above make of a run
 * rather than being even - the top three sit close together because anything over 90% is already a
 * run whose presses nearly all landed in the top two tiers, while the bottom half steps a flat ten
 * points a letter, where the letter is really reporting how much of the chart went by unplayed.
 *
 * Derived on demand and never stored (ADR-0016's reasoning for Rating applies unchanged: a saved
 * grade would outlive the run that earned it), so retuning a number here re-grades every future run
 * with nothing to migrate.
 */
export const GRADE_THRESHOLDS = [
  { grade: 'S+', minAccuracy: 0.98 },
  { grade: 'S', minAccuracy: 0.95 },
  { grade: 'A', minAccuracy: 0.9 },
  { grade: 'B', minAccuracy: 0.8 },
  { grade: 'C', minAccuracy: 0.7 },
  { grade: 'D', minAccuracy: 0.6 },
  { grade: 'E', minAccuracy: 0.5 },
  { grade: 'F', minAccuracy: 0 },
] as const satisfies readonly { grade: VsrgGrade; minAccuracy: number }[];

/**
 * The top letter, and what it will tolerate.
 *
 * The threshold alone cannot enforce this: one miss among a thousand hits still rounds to 99.9%
 * accuracy, and the top grade has to mean the run everybody watching could see was clean. It is the
 * only letter carrying a rule beyond its floor, because it is the only one claiming something
 * absolute rather than a proportion.
 */
const TOP_GRADE: VsrgGrade = 'S+';
const MAX_MISSES_FOR_TOP_GRADE = 0;

/**
 * How much of a run landed, 0-1: the weighted tally over what those same presses would have been
 * worth had every one of them been an `amazing`.
 *
 * A run with no judgments at all is 0, not 1 - an untouched chart is not a flawless one, and this
 * is what a song stopped before its first note reports.
 */
export function vsrgAccuracy(tally: VsrgHitTally): number {
  let earned = 0;
  let judged = 0;
  for (const type of Object.keys(ACCURACY_WEIGHTS) as VsrgPlayerHitType[]) {
    earned += tally[type] * ACCURACY_WEIGHTS[type];
    judged += tally[type];
  }
  return judged === 0 ? 0 : earned / judged;
}

/** The letter for a run's tallies. Floors are inclusive, so 0.95 accuracy is an S and not an A. */
export function vsrgGrade(tally: VsrgHitTally): VsrgGrade {
  const accuracy = vsrgAccuracy(tally);
  for (const { grade, minAccuracy } of GRADE_THRESHOLDS) {
    if (accuracy < minAccuracy) continue;
    if (grade === TOP_GRADE && tally.miss > MAX_MISSES_FOR_TOP_GRADE) continue;
    return grade;
  }
  //unreachable while the table ends at a floor of 0, which vsrgAccuracy can never come in under
  return 'F';
}
