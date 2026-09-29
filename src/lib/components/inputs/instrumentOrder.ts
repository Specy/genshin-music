import { capitalize } from '$core/utils/Utilities';

/**
 * The order every instrument menu lists a game's instruments in, shared so the settings select
 * (InstrumentSelect) and the floating pickers can never disagree.
 *
 * GROUPS by name prefix: `SFX_Dance` belongs to 'SFX', a name without `_` to UNGROUPED. The
 * ungrouped instruments come first, whatever they sort as; the prefix groups follow A-Z.
 *
 * ORDER within a group is alphabetical by what the user reads (the localized label, so "Lyre" is
 * "Lira" in it and Chinese names in zh), with the active language's collator. `numeric` sorts a
 * "Drum 2"/"Drum 10" family by number; `sensitivity: 'base'` keeps casing and accents from
 * outranking letters, and `sort` is stable, so labels that compare equal keep config order.
 */
export const UNGROUPED = 'instruments';

/** Group membership only, each group in config order. */
export function groupInstruments(
  list: readonly string[]
): (readonly [string, readonly string[]])[] {
  const prefixes = new Set(
    list.filter((name) => name.includes('_')).map((name) => name.split('_')[0])
  );
  return [
    [UNGROUPED, list.filter((name) => !name.includes('_'))],
    ...[...prefixes].map(
      (prefix) => [prefix, list.filter((name) => name.startsWith(`${prefix}_`))] as const
    ),
  ];
}

/** The groups and their instruments in menu order, for `language`, labelled by `label`. */
export function sortInstrumentGroups(
  groups: readonly (readonly [string, readonly string[]])[],
  language: string,
  label: (name: string) => string
): (readonly [string, readonly string[]])[] {
  const collator = new Intl.Collator(language, { numeric: true, sensitivity: 'base' });
  return groups
    .map(
      ([prefix, names]) =>
        [prefix, [...names].sort((a, b) => collator.compare(label(a), label(b)))] as const
    )
    .sort(([a], [b]) => {
      if (a === UNGROUPED) return -1;
      if (b === UNGROUPED) return 1;
      return collator.compare(capitalize(a), capitalize(b));
    });
}

/** Every instrument in menu order, as one flat list (for menus without group headers). */
export function sortedInstruments(
  list: readonly string[],
  language: string,
  label: (name: string) => string
): string[] {
  return sortInstrumentGroups(groupInstruments(list), language, label).flatMap(
    ([, names]) => names
  );
}
