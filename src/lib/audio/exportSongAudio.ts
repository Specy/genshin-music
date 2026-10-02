// The one offline audio export both the player and the composer run: ask for a format, render
// the song through OfflineSongRenderer, encode, download. Lives here rather than on either page
// so the two cannot drift in what they ask, what they name the file, or what they report.

import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
import type { RecordedSong } from '$core/Songs/RecordedSong';
import { fileService } from '$core/Services/FileService';
import { i18n } from '$i18n/i18n';
import { asyncSelect } from '$stores/AsyncPromptStore.svelte';
import { logger } from '$stores/LoggerStore.svelte';
import { renderSongToAudioBuffer, SongRenderCancelledError } from './OfflineSongRenderer';

/** Written out rather than derived from a table: the two formats ARE the dialog below. */
type AudioExportFormat = 'wav' | 'mp3';

/**
 * Render `song` and hand the file to the browser as `<songName>.<format>`. There is no filename
 * prompt: the song's own name is the file's, exactly as the sheet and MIDI downloads do it.
 *
 * Cancelling reports nothing — the user asked for the stop, and a toast telling them it stopped
 * is noise. Every other failure is one error toast plus the real error on the console.
 */
export async function exportSongAudio(song: RecordedSong | ComposedSong, songName: string) {
  const format = await asyncSelect<AudioExportFormat>(i18n.t('question:pick_audio_export_format'), [
    {
      value: 'wav',
      text: i18n.t('menu:audio_format_wav'),
      description: i18n.t('menu:audio_format_wav_description'),
    },
    {
      value: 'mp3',
      text: i18n.t('menu:audio_format_mp3'),
      description: i18n.t('menu:audio_format_mp3_description'),
    },
  ]);
  if (format === null) return;
  // The 0 matters: toRecordedSong's default offset would prepend 100 ms of silence to the file.
  const recorded = song instanceof ComposedSong ? song.toRecordedSong(0) : song;

  const controller = new AbortController();
  const actions = [{ text: i18n.t('common:cancel'), onClick: () => controller.abort() }];
  // Spinner and actions are passed on every call, not just the first: showPill resets whatever
  // its options omit, so re-showing with a new percentage would otherwise drop the Cancel button.
  const showProgress = (fraction: number) =>
    logger.showPill(
      i18n.t('logs:rendering_song_audio', { percentage: Math.round(fraction * 100) }),
      { spinner: true, actions }
    );

  showProgress(0);
  try {
    const buffer = await renderSongToAudioBuffer(recorded, {
      onProgress: showProgress,
      signal: controller.signal,
    });
    // Encoding is past the last cancel point, so the pill drops the Cancel button here rather
    // than offering one that cannot be honoured.
    logger.showPill(i18n.t('logs:encoding_song_audio'), { spinner: true });
    if (format === 'mp3') {
      await fileService.downloadAudioBufferAsMp3(buffer, songName);
    } else {
      await fileService.downloadAudioBufferAsWav(buffer, songName);
    }
    logger.success(i18n.t('logs:song_audio_exported'));
  } catch (e) {
    if (e instanceof SongRenderCancelledError) return;
    console.error(e);
    logger.error(i18n.t('logs:error_exporting_song_audio'));
  } finally {
    logger.hidePill();
  }
}
