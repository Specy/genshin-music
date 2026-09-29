// Instrument Settings at runtime (ADR-0018): what the active game's instruments declare,
// and how a track's stored values resolve against it. Shared by the song model (validation
// on load, complete values on save), the audio engine (which samples a Variant loads) and
// the UI (which rows to show). Pure: no DOM, no audio.
import { game } from '$game';
import type { InstrumentName } from '$core/types';
import type {
  InstrumentSettingDefinition,
  InstrumentSettingsDefinition,
  VariantSettingDefinition,
} from './types';

/** A stored setting value. A Variant stores its option id; later kinds may store numbers or flags. */
export type InstrumentSettingValue = string | number | boolean;

/** A track's settings by setting id. In memory, a missing id means "the declared default". */
export type InstrumentSettingValues = Record<string, InstrumentSettingValue>;

/** The settings `name` declares in the active game, or undefined when it declares none. */
export function declaredSettings(name: InstrumentName): InstrumentSettingsDefinition | undefined {
  return game.instruments.data[name]?.settings;
}

/** The instrument's Variant setting (an instrument declares at most one), with its setting id. */
export function variantSettingOf(
  name: InstrumentName
): { id: string; definition: VariantSettingDefinition } | undefined {
  const declared = declaredSettings(name);
  if (declared === undefined) return undefined;
  for (const [id, definition] of Object.entries(declared)) {
    if (definition.kind === 'variant') return { id, definition };
  }
  return undefined;
}

/**
 * An OWN property only: a stored map is untrusted data and an inherited member is no value. Not
 * Object.hasOwn, which older iOS Safari lacks and nothing in the build polyfills.
 */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isValidValue(
  definition: InstrumentSettingDefinition,
  value: unknown
): value is InstrumentSettingValue {
  return typeof value === 'string' && definition.options.some((option) => option.id === value);
}

/**
 * The stored values worth keeping: declared ids holding valid values. Unknown ids and invalid
 * values are dropped, which is how they fall back to the declared default. Takes any input,
 * since it reads song files and stored user settings.
 */
export function normalizeStoredSettings(
  name: InstrumentName,
  stored: unknown
): InstrumentSettingValues {
  const declared = declaredSettings(name);
  if (declared === undefined || typeof stored !== 'object' || stored === null) return {};
  const kept: InstrumentSettingValues = {};
  for (const [id, definition] of Object.entries(declared)) {
    if (!hasOwn(stored, id)) continue;
    const value = (stored as Record<string, unknown>)[id];
    if (isValidValue(definition, value)) kept[id] = value;
  }
  return kept;
}

/**
 * Every setting `name` declares, with its effective value: the stored one when valid, else the
 * declared default. Empty for an instrument that declares nothing. This is what songs save
 * (defaults included, ADR-0018) and what the engine plays.
 */
export function resolveInstrumentSettings(
  name: InstrumentName,
  stored: unknown
): InstrumentSettingValues {
  const declared = declaredSettings(name);
  if (declared === undefined) return {};
  const kept = normalizeStoredSettings(name, stored);
  const resolved: InstrumentSettingValues = {};
  for (const [id, definition] of Object.entries(declared)) {
    resolved[id] = hasOwn(kept, id) ? kept[id] : definition.default;
  }
  return resolved;
}

/**
 * Button i's sample file under the given settings, or undefined when the instrument has no
 * Variant (its notes' own `file`s apply).
 */
export function variantFiles(name: InstrumentName, stored: unknown): readonly string[] | undefined {
  const variant = variantSettingOf(name);
  if (variant === undefined) return undefined;
  const chosen = resolveInstrumentSettings(name, stored)[variant.id];
  return variant.definition.options.find((option) => option.id === chosen)?.files;
}

/**
 * What makes two engines interchangeable: the instrument, plus every setting that changes which
 * samples load (today, the Variant). Engine reuse and the decoded-sample pool are keyed by it.
 */
export function instrumentIdentityKey(name: InstrumentName, stored: unknown): string {
  const variant = variantSettingOf(name);
  if (variant === undefined) return name;
  return `${name}#${String(resolveInstrumentSettings(name, stored)[variant.id])}`;
}
