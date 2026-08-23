<script lang="ts">
  import { t } from '$i18n/binding.svelte';

  let {
    notes,
    accidentals,
    outOfRange,
    outOfRangeBounds = null,
  }: {
    notes: number;
    accidentals: number;
    outOfRange: number;
    /**
     * The up/down split of `outOfRange`, shown inline beside the total. Null where only the total
     * is known - the whole-import summary counts out-of-range notes without keeping the direction.
     */
    outOfRangeBounds?: { upper: number; lower: number } | null;
  } = $props();
</script>

<table class="midi-stats-table">
  <thead>
    <tr>
      <th scope="col">{t('composer:midi_parser.number_of_notes')}</th>
      <th scope="col">{t('composer:midi_parser.of_which_dont_fit')}</th>
      <th scope="col">{t('composer:midi_parser.of_which_out_of_range')}</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>{notes}</td>
      <td>{accidentals}</td>
      <td>
        {outOfRange}
        {#if outOfRangeBounds && outOfRangeBounds.upper + outOfRangeBounds.lower > 0}
          <span class="out-of-range-split">
            (<svg
              stroke="currentColor"
              fill="currentColor"
              stroke-width="0"
              viewBox="0 0 448 512"
              height="0.8em"
              width="0.8em"
              xmlns="http://www.w3.org/2000/svg"
              ><path
                d="M34.9 289.5l-22.2-22.2c-9.4-9.4-9.4-24.6 0-33.9L207 39c9.4-9.4 24.6-9.4 33.9 0l194.3 194.3c9.4 9.4 9.4 24.6 0 33.9L413 289.4c-9.5 9.5-25 9.3-34.3-.4L264 168.6V456c0 13.3-10.7 24-24 24h-32c-13.3 0-24-10.7-24-24V168.6L69.2 289.1c-9.3 9.8-24.8 10-34.3.4z"
              /></svg
            >{outOfRangeBounds.upper}
            <svg
              stroke="currentColor"
              fill="currentColor"
              stroke-width="0"
              viewBox="0 0 448 512"
              height="0.8em"
              width="0.8em"
              xmlns="http://www.w3.org/2000/svg"
              ><path
                d="M413.1 222.5l22.2 22.2c9.4 9.4 9.4 24.6 0 33.9L241 473c-9.4 9.4-24.6 9.4-33.9 0L12.7 278.6c-9.4-9.4-9.4-24.6 0-33.9l22.2-22.2c9.5-9.5 25-9.3 34.3.4L184 343.4V56c0-13.3 10.7-24 24-24h32c13.3 0 24 10.7 24 24v287.4l114.8-120.5c9.3-9.8 24.8-10 34.3-.4z"
              /></svg
            >{outOfRangeBounds.lower})
          </span>
        {/if}
      </td>
    </tr>
  </tbody>
</table>

<style>
  /* A visible TABLE, not floating numbers: its own background with internal gridlines only -
     the background carries the outer edge, so the radius needs no outer border to fight.
     separate+0 rather than collapse, because border-radius does not reliably clip collapsed
     borders. */
  .midi-stats-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    border-radius: 0.3rem;
    overflow: hidden;
    border: solid 0.1rem var(--secondary);
  }

  .midi-stats-table th {
    font-weight: normal;
    opacity: 0.75;
    text-align: center;
    vertical-align: top;
    padding: 0.15rem 0.3rem;
  }

  .midi-stats-table td {
    text-align: center;
    vertical-align: top;
    padding: 0.1rem 0.3rem 0.2rem;
    white-space: nowrap;
  }

  .midi-stats-table th:not(:first-child),
  .midi-stats-table td:not(:first-child) {
    border-left: solid 0.1rem var(--secondary);
  }

  .midi-stats-table tbody td {
    border-top: solid 0.1rem var(--secondary);
  }

  .out-of-range-split {
    opacity: 0.85;
  }
</style>
