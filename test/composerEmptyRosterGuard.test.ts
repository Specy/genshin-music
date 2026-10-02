import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const component = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8');
const instanceScript = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)?.[1];
if (!instanceScript) throw new Error('Composer.svelte has no TypeScript instance script');
const source = ts.createSourceFile(
  'Composer.svelte.ts',
  instanceScript,
  ts.ScriptTarget.Latest,
  true
);

function functionBody(name: string): string {
  const declaration = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name
  );
  if (!declaration?.body) throw new Error(`Composer.svelte has no ${name} function body`);
  return declaration.body.getText(source);
}

describe('Composer empty-roster sound guards', () => {
  it.each(['playSound', 'playAuditionSound', 'playHeldSound'])(
    '%s refuses a layer with no song roster entry before reading its Basepoint',
    (name) => {
      const body = functionBody(name);
      const lookup = body.indexOf('const instrumentData = song.instruments[layer]');
      const guard = body.indexOf('if (!instrument || !instrumentData) return');
      const dereference = body.indexOf('instrumentData.pitch');

      expect(lookup).toBeGreaterThanOrEqual(0);
      expect(guard).toBeGreaterThan(lookup);
      expect(dereference).toBeGreaterThan(guard);
    }
  );
});
