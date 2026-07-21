<script lang="ts">
    import type {Snippet} from 'svelte'

    // Old: src/components/pages/blog/BlogUl.tsx (56 lines) - exported BlogUl/BlogOl/BlogLi/BlogP/
    // BlogB/BlogIframe/BlogLink, thin per-tag wrappers whose entire job was applying a
    // blog.module.scss class (Ul/Li applied none at all - CSS Modules only, nothing else).
    //
    // DESIGN DEVIATION (disclosed): NOT ported as 7 reusable snippets/components. Svelte
    // snippets, unlike JSX children, have no anonymous-literal form - every `{@render blogP(x)}`
    // needs a uniquely-named `{#snippet x()}...{/snippet}` at the call site, and `<BlogP>` alone
    // appears ~40+ times across the 8 posts (every post's paragraphs). That naming tax is real
    // transcription risk for content this brief itself calls "bulk-mechanical" and demands
    // byte-parity for. Instead: each post writes the NATIVE tag directly (`<p class="blog-p">`,
    // `<li>`, `<ol class="blog-ol">`, `<b class="blog-b">`, `<iframe class="blog-iframe">`, an
    // `AppLink` with `className="blog-link"`) - the lowest-risk, most literal per-tag JSX->Svelte
    // translation, identical to how every other primitive (Row/Column/Card/...) is already used
    // directly with a className prop throughout this migration. This file's job shrinks to: own
    // the (now-global) CSS for those class names, since Svelte's file-scoped style block can't
    // reach a native tag authored in a DIFFERENT file - and stay a real (if inert) child of
    // BaseBlogPost.svelte's `<article>` so that CSS is actually bundled wherever a post renders,
    // via a transparent pass-through wrapper (`{@render children?.()}`, nothing else).
    // BlogUl/BlogLi apply no class in old either, so neither gets a rule below.
    let {children}: {children?: Snippet} = $props()
</script>

{@render children?.()}

<style>
    /* Old: src/components/pages/blog/blog.module.scss - the 5 selectors this file owns
       (BaseBlogPost.svelte's own style block owns the other 7 - see that file's header comment for the
       full split accounting). Every one is :global() now (this file no longer renders any of the
       tags these classes are applied to - they're authored directly in each of the 8 post files),
       same treatment the "child rendered by a foreign component" cases elsewhere in this task use. */
    :global(.blog-p) {
        margin: 1rem 0;
        user-select: text;
    }

    :global(.blog-b) {
        font-weight: bold;
        font-family: RobotoSerif, serif;
    }

    :global(.blog-ol) {
        margin: 0;
        font-family: RobotoSerif, serif;
        padding: 0;
        list-style-type: none;
        margin-left: 2rem;
        user-select: text;
    }

    :global(.blog-ol li) {
        counter-increment: step-counter;
        position: relative;
        margin: 1rem 0;
        font-family: RobotoSerif, serif;
        opacity: 0.9;
        user-select: text;
    }

    :global(.blog-ol li)::before {
        content: counter(step-counter);
        position: absolute;
        background-color: var(--accent);
        color: var(--accent-text);
        transform: translateX(calc(-100% - 0.5rem));
        border-radius: 2rem;
        font-weight: bold;
        min-width: 1.5rem;
        height: 100%;
        padding: 0;
        text-align: center;
    }

    :global(.blog-iframe) {
        height: min(20rem, 70vh);
        margin: 2rem 0;
        border: unset;
        box-shadow: 0 0 0.5rem 0.5rem rgba(0, 0, 0, 0.1);
        border-radius: 0.5rem;
    }

    :global(.blog-link) {
        color: var(--accent);
        text-decoration: underline;
    }
</style>
