// PUBLIC_IS_BETA is only ever set (to the literal string 'true') by the beta-deploy CI
// workflows (.github/workflows/deployBeta.yml, deployBetaSingleDomain.yml) — every other
// build (dev, the production Deploy.yml, this repo's own npm run build*) leaves it unset.
//
// $env/static/public requires every named import to exist in the environment at
// sync/build time (Kit generates that virtual module's exports by enumerating the actual
// PUBLIC_-prefixed vars it finds) — importing an absent one is a hard error. Verified
// empirically: `import {PUBLIC_IS_BETA} from '$env/static/public'` with the var unset
// fails `svelte-check` with "Module '\"$env/static/public\"' has no exported member
// 'PUBLIC_IS_BETA'" (and fails the Vite build the same way), so that form can't be used
// for an optional flag. Falling back to Vite's own import.meta.env instead: Vite exposes
// any process env var matching Kit's publicPrefix ('PUBLIC_' by default) on
// import.meta.env automatically (the same mechanism $env/static/public itself is built
// on) — undefined when unset, the literal string when set. Verified empirically via
// `PUBLIC_IS_BETA=true npm run build:genshin` + grepping the emitted output for the
// inlined `true`.
export const IS_BETA = import.meta.env.PUBLIC_IS_BETA === 'true';
