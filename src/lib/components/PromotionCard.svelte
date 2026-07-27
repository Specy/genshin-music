<script lang="ts">
    import {onMount} from 'svelte'
    import type {ClassValue} from 'svelte/elements'
    import {base} from '$app/paths'
    import {APP_NAME} from '$core/legacyConfig'
    import {game} from '$game'
    import {t} from '$i18n/binding.svelte'
    import Card from './layout/Card.svelte'
    import Row from './layout/Row.svelte'
    import Column from './layout/Column.svelte'
    import Header from './header/Header.svelte'
    import AppLink from './AppLink.svelte'
    import AppButton from './inputs/AppButton.svelte'

    const promotion = {
        id: '1',
        title: `Help fund ${game.meta.title}!`,
        description: `Donate to help us with the development of ${game.meta.title}!`,
        image: `${base}/manifestData/main.webp`,
        url: '/donate'
    }

    interface PromotionCardProps {
        onclick?: (e: MouseEvent) => void
        alwaysVisible?: boolean
        style?: string
        class?: ClassValue
    }

    let {onclick, alwaysVisible = false, style = '', class: cls = ''}: PromotionCardProps = $props()

    let visible = $state(false)

    // QUIRK: the promotion never shows on a user's very first visit -
    // `viewedPromotionsBefore` starts false, so `visible` stays false
    // regardless of `promotionId` until a second visit.
    onMount(() => {
        const viewedPromotionsBefore = Boolean(localStorage.getItem(`${APP_NAME}_viewed_promotions_before`))
        const promotionId = localStorage.getItem(`${APP_NAME}_viewed_promotion`) ?? ''
        if (promotionId !== promotion.id && viewedPromotionsBefore) {
            visible = true
        }
        localStorage.setItem(`${APP_NAME}_viewed_promotions_before`, 'true')
    })

    function close() {
        visible = false
        localStorage.setItem(`${APP_NAME}_viewed_promotion`, promotion.id)
    }
</script>

{#snippet faTimesIcon()}
    <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 352 512"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
    ><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg>
{/snippet}

{#if visible || alwaysVisible}
    <Card radius="0.4rem" {style} class={[cls, 'promotion-card']}>
        <img src={promotion.image} alt={promotion.title} class="promotion-image" />

        <Row style="z-index:2" justify="between">
            <Column style="padding:0.8rem 1rem" gap="0.4rem">
                <Header type="h3">{promotion.title}</Header>
                <div style="max-width:40ch;opacity:0.9">
                    {promotion.description}
                </div>
            </Column>
            <Column justify="end" padding="0.5rem" class="promotion-right-side">
                {#if !alwaysVisible}
                    <button class="promotion-close" onclick={close} title={t('home:close_promotion')}>
                        {@render faTimesIcon()}
                    </button>
                {/if}
                <AppLink href={promotion.url} {onclick}>
                    <AppButton cssVar="accent">
                        {t('home:find_out_more')}
                    </AppButton>
                </AppLink>
            </Column>
        </Row>
    </Card>
{/if}

<style>
    /* `.promotion-card`/`.promotion-right-side` are applied via Card/Column's
       own `class` prop (elements belonging to their compiled templates,
       not this file's) - both need :global(). `.promotion-image`/
       `.promotion-close` are native elements this file's own template
       renders directly, so plain scoped CSS already reaches them. */
    :global(.promotion-card) {
        position: relative;
        border: solid 0.1rem var(--secondary);
        overflow: hidden;
    }

    .promotion-image {
        position: absolute;
        top: 0;
        left: 0;
        object-fit: cover;
        width: 100%;
        height: 100%;
        filter: blur(0.1rem);
        mask: linear-gradient(to left, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.05) 60%);
    }

    .promotion-close {
        position: absolute;
        padding: 0.4rem;
        display: flex;
        justify-content: center;
        align-items: center;
        border: none;
        font-size: 1rem;
        color: var(--secondary-text);
        border-bottom-left-radius: 0.4rem;
        width: 3rem;
        cursor: pointer;
        z-index: 3;
        background-color: var(--secondary);
        top: 0;
        right: 0;
        transition: background-color 0.2s;
    }

    .promotion-close:hover {
        background-color: var(--secondary-layer-10);
    }

    :global(.promotion-right-side) {
        background: linear-gradient(to left, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.05));
    }
</style>
