<script lang="ts">
  import BaseBlogPost from '$cmp/blog/BaseBlogPost.svelte';
  import AppLink from '$cmp/AppLink.svelte';
  import Header from '$cmp/header/Header.svelte';
  import { aiTransposeMetadata } from '$cmp/blog/posts/video-audio-transpose';
</script>

<BaseBlogPost metadata={aiTransposeMetadata}>
  <!-- QUIRK: this AppLink and the one below get no blog-link class and no target="_blank",
         unlike every other post's links - preserved as-is, not a missed styling/target fix. -->
  <p class="blog-p">
    In the V3.3 release, a new experimental feature has been added that allows you to convert any
    video/audio into a sheet, by first converting it to MIDI, by using <AppLink
      href="https://basicpitch.spotify.com/"
    >
      Spotify's Basic Pitch
    </AppLink>.
  </p>
  <Header margin="1rem 0">Warnings</Header>
  <p class="blog-p">
    This feature is to be used only as a last resort after you cannot find a MIDI song to transpose,
    or you can't do it by hand. It is not meant to create a perfect transposition, as the conversion
    is very difficult, but mostly as a starting point to help you transpose a song manually.
  </p>

  <Header margin="1rem 0">Best practices</Header>
  <p class="blog-p">
    It is best if you can find a video/audio of a song that uses a single instrument, the piano is
    the easiest to convert. Even better if there is no background noise.
  </p>

  <Header margin="1rem 0">How to</Header>
  <p class="blog-p">
    The transposition steps are very similar to the ones of MIDI transposition, if you want to see
    how to do that, visit the <AppLink href="/blog/posts/midi-transpose">
      MIDI transposition guide
    </AppLink>. You have to open the MIDI conversion tool, and select the audio/video file by
    clicking the file selection button "Open MIDI/Audio/Video file"
  </p>
</BaseBlogPost>
