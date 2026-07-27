<script lang="ts">
    import AppButton, {type AppButtonProps} from './AppButton.svelte'

    interface IconButtonProps extends AppButtonProps {
        size?: string
    }

    let {size, style = '', className = '', children, ...rest}: IconButtonProps = $props()

    const computedStyle = $derived(
        `width:${size ?? '2rem'};height:${size ?? '2rem'};min-width:${size ?? '2rem'};min-height:${size ?? '2rem'};${style}`
    )
</script>

<AppButton {...rest} style={computedStyle} className="icon-app-button flex-centered {className}">
    {@render children?.()}
</AppButton>
