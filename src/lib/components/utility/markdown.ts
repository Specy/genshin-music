import { lexer, type MarkedToken, type Token } from 'marked';

// TRANSLATED MARKDOWN, AS A FIXED SET OF NODES. Some translated strings are written in markdown
// (the home page's about text), and translations come from contributors, so they are never
// rendered as markup: marked only TOKENIZES them here, and the tokens are copied into the small
// node set below, which Markdown.svelte renders element by element as escaped text. Anything the
// set does not cover (images, tables, quotes, code blocks, raw HTML) comes through as its plain
// text, and a link survives only when it points into the app or at an https URL.

export type MarkdownInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: MarkdownInline[] }
  | { kind: 'em'; children: MarkdownInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; external: boolean; children: MarkdownInline[] };

export type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3 | 4 | 5 | 6; children: MarkdownInline[] }
  | { kind: 'paragraph'; children: MarkdownInline[] }
  // A tight list item's content: inline nodes with no paragraph around them.
  | { kind: 'text'; children: MarkdownInline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: MarkdownBlock[][] };

/** An app path ('/composer'), never a protocol-relative '//host' one. */
const INTERNAL_HREF = /^\/(?!\/)/;
const EXTERNAL_HREF = /^https:\/\//i;

/** The markdown source of `source`, as the nodes Markdown.svelte knows how to render. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  return toBlocks(lexer(source));
}

/**
 * Backslash-escapes the characters markdown would read as syntax, for a plain value (a name, a
 * list of names) interpolated into a markdown string.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>#|~!]/g, '\\$&');
}

// marked's Token union also holds a catch-all for tokens that parser extensions invent. None are
// registered here, so every token is one of the built-in kinds and the switches below can narrow.
function toBlocks(tokens: Token[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const token of tokens as MarkedToken[]) {
    switch (token.type) {
      case 'space':
        break;
      case 'heading':
        // The page around the markdown owns the <h1>, so the text's own headings start at <h2>.
        blocks.push({
          kind: 'heading',
          level: Math.min(6, Math.max(2, token.depth)) as 2 | 3 | 4 | 5 | 6,
          children: toInlines(token.tokens),
        });
        break;
      case 'paragraph':
        blocks.push({ kind: 'paragraph', children: toInlines(token.tokens) });
        break;
      case 'text':
        blocks.push({
          kind: 'text',
          children: token.tokens ? toInlines(token.tokens) : [{ kind: 'text', text: token.text }],
        });
        break;
      case 'list':
        blocks.push({
          kind: 'list',
          ordered: token.ordered,
          start: typeof token.start === 'number' ? token.start : 1,
          items: token.items.map((item) => toBlocks(item.tokens)),
        });
        break;
      default: {
        const text = token.raw.trim();
        if (text) blocks.push({ kind: 'paragraph', children: [{ kind: 'text', text }] });
      }
    }
  }
  return blocks;
}

function toInlines(tokens: Token[]): MarkdownInline[] {
  return mergeText(
    (tokens as MarkedToken[]).flatMap((token): MarkdownInline[] => {
      switch (token.type) {
        case 'text':
          return token.tokens ? toInlines(token.tokens) : [{ kind: 'text', text: token.text }];
        case 'escape':
          return [{ kind: 'text', text: token.text }];
        case 'strong':
        case 'em':
          return [{ kind: token.type, children: toInlines(token.tokens) }];
        case 'codespan':
          return [{ kind: 'code', text: token.text }];
        case 'link': {
          const children = toInlines(token.tokens);
          const external = EXTERNAL_HREF.test(token.href);
          if (!external && !INTERNAL_HREF.test(token.href)) return children;
          return [{ kind: 'link', href: token.href, external, children }];
        }
        case 'image':
          return [{ kind: 'text', text: token.text }];
        default:
          // Strikethrough and anything else that wraps text keeps its text; raw HTML, line breaks
          // and the like come through as the characters that were written.
          return 'tokens' in token && token.tokens
            ? toInlines(token.tokens)
            : [{ kind: 'text', text: token.raw }];
      }
    })
  );
}

/** Joins neighbouring text nodes: escapes and dropped links split one run of text into several. */
function mergeText(nodes: MarkdownInline[]): MarkdownInline[] {
  const merged: MarkdownInline[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.kind === 'text' && last?.kind === 'text') {
      merged[merged.length - 1] = { kind: 'text', text: last.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}
