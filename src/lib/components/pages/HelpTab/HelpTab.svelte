<script lang="ts">
    import Header from '$cmp/header/Header.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import HelpTooltip from '$cmp/utility/HelpTooltip.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/pages/Index/HelpTab/index.tsx's `HelpTab` export (of 3 total in that
    // file - the other two, ComposerShortcuts/PlayerShortcuts, are sibling files in this port, see
    // their own header comments). `useTranslation('tutorials')` is the SOLE (default) namespace
    // here - every bare (unprefixed) t() call below resolves against it, written out explicitly
    // per this migration's established convention.
    //
    // HelpTab.module.css: its ONLY rule consumed by this file (`.help-icon-wrapper`/`.help-icon`)
    // lives on PlayerMenu.svelte instead (the sole real consumer, in its Help MenuPanel) - not
    // here, since this component itself renders none of those classes. See PlayerMenu.svelte's own
    // <style> block for the full-module port + the disclosure about its 3 zero-consumer rules.
</script>

<div style="margin:0.5rem 0">
    {t('tutorials:help.question_mark_description')}
    <HelpTooltip parentStyle="display:inline-flex" buttonStyle="width:1.2rem;height:1.2rem;margin:0 0.4rem">
        {t('tutorials:help.example_help')}
    </HelpTooltip>
</div>
<Header type="h2">{t('tutorials:help.learn_how_to_use_player')}</Header>
<p>
    <AppLink href="/blog/posts/how-to-use-player">{t('tutorials:help.click_to_visit_blog')}</AppLink>
</p>
<Header type="h2">{t('tutorials:help.learn_how_to_use_composer')}</Header>
<p>
    <AppLink href="/blog/posts/how-to-use-composer">{t('tutorials:help.click_to_visit_blog')}</AppLink>
</p>
