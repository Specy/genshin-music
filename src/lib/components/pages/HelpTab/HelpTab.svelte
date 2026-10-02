<script lang="ts">
  import Header from '$cmp/header/Header.svelte';
  import AppLink from '$cmp/AppLink.svelte';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';
  import { t } from '$i18n/binding.svelte';
</script>

<div style="margin:0.5rem 0">
  {t('tutorials:help.question_mark_description')}
  <HelpTooltip
    parentStyle="display:inline-flex"
    buttonStyle="width:1.2rem;height:1.2rem;margin:0 0.4rem"
  >
    {t('tutorials:help.example_help')}
  </HelpTooltip>
</div>
<Header type="h2">{t('tutorials:help.learn_how_to_use_player')}</Header>
<p>
  <AppLink href="/blog/posts/how-to-use-player">{t('tutorials:help.click_to_visit_blog')}</AppLink>
</p>
<Header type="h2">{t('tutorials:help.learn_how_to_use_composer')}</Header>
<p>
  <AppLink href="/blog/posts/how-to-use-composer">{t('tutorials:help.click_to_visit_blog')}</AppLink
  >
</p>
