<script lang="ts">
  import windSongDb from '$lib/assets/images/partners/windsong-db.jpg';
  import skyMusicianNetwork from '$lib/assets/images/partners/sky-musician-network.jpg';
  import skyMemories from '$lib/assets/images/partners/theskymemories.jpg';
</script>

<!-- The partner cards, verbatim from the deleted /partners route: they now live inline at the
     bottom of the blog index, which is the only place they render. -->
<div class="partner-wrapper">
  <div class="partner">
    <div class="partner-title">Specy</div>
    <div class="partner-description">
      The youtube channel that collects videos created by users of this app
    </div>
    <iframe
      src="https://www.youtube.com/embed/Sh7kqYVMjwM"
      title="Specy"
      frameborder="0"
      allow="autoplay; picture-in-picture"
      allowfullscreen
    ></iframe>
  </div>

  <div class="partner">
    <div class="partner-title">Sky Musician Network</div>
    <div class="partner-description">A community discord server focused on music in Sky Cotl</div>
    <a
      href="https://discord.gg/qW7uQgUfj9"
      style="width: 18.8rem; height: 10.5rem; overflow: hidden; border-radius: 0.3rem;"
      target="_blank"
      rel="noreferrer"
    >
      <img
        src={skyMusicianNetwork}
        alt="Sky musician network"
        loading="lazy"
        style="width: 100%; object-fit: cover; height: auto;"
      />
    </a>
  </div>

  <div class="partner">
    <div class="partner-title">uma✿</div>
    <div class="partner-description">
      Arranges music, primarily from anime and games for Sky and Genshin.
    </div>
    <iframe
      src="https://www.youtube.com/embed/7aIkAGvp9Y0"
      title="uma"
      frameborder="0"
      allow="autoplay; picture-in-picture"
      allowfullscreen
    ></iframe>
  </div>

  <div class="partner">
    <div class="partner-title">Windsong DB</div>
    <div class="partner-description">A Genshin Impact Database for Instrument Gadget Keymaps</div>
    <a
      href="https://genshin-lyre.notion.site/genshin-lyre/Windsong-DB-8012b5f6939b486d857552c7b60e917f"
      style="width: 18.8rem; height: 10.5rem; overflow: hidden; border-radius: 0.3rem;"
      target="_blank"
      rel="noreferrer"
    >
      <img
        src={windSongDb}
        alt="Windsong DB"
        loading="lazy"
        style="width: 100%; object-fit: cover; height: auto;"
      />
    </a>
  </div>

  <div class="partner">
    <div class="partner-title">The Sky Memories</div>
    <div class="partner-description">An unofficial sanctuary to preserve all your sky memories</div>
    <a
      href="https://theskymemories.com/"
      style="width: 18.8rem; height: 10.5rem; overflow: hidden; border-radius: 0.3rem;"
      target="_blank"
      rel="noreferrer"
    >
      <img
        src={skyMemories}
        alt="The Sky Memories"
        loading="lazy"
        style="width: 100%; object-fit: cover; height: auto;"
      />
    </a>
  </div>
</div>

<style>
  .partner-wrapper {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    padding: 1rem;
  }

  .partner {
    width: 100%;
    min-height: 11rem;
    height: fit-content;
    border-radius: 0.5rem;
    background-color: var(--primary);
    color: var(--primary-text);
    overflow: hidden;
    transition: all 0.2s ease-out;
    width: 20rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.6rem;
    margin: 0.5rem;
  }

  .partner iframe {
    border-radius: 0.3rem;
    width: 18.8rem;
    height: 10.5rem;
  }

  .partner-description {
    width: 100%;
    margin-top: 0.4rem;
    border-top: 1px solid var(--icon-color);
    font-size: 0.9rem;
    padding: 0.4rem;
  }

  .partner-title {
    font-size: 1.2rem;
    color: var(--primary-text);
  }
</style>
