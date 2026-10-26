import { Injectable, signal } from '@angular/core';
import type { Race } from '../core/models';

/** The finish replay overlay: loops the video's slow-motion replay window. */
@Injectable({ providedIn: 'root' })
export class ReplayPlayer {
  readonly isOpen = signal(false);
  private video: HTMLVideoElement | null = null;
  private bounds: [number, number] | null = null;

  attachVideo(video: HTMLVideoElement): void {
    this.video = video;
    video.muted = true;
    video.addEventListener('timeupdate', () => {
      if (this.bounds && video.currentTime >= this.bounds[1]) video.currentTime = this.bounds[0];
    });
  }

  private seek = (): void => { if (this.bounds && this.video) this.video.currentTime = this.bounds[0]; };

  open(r: Race): void {
    const video = this.video;
    if (!video || r.replayStart == null || r.replayEnd == null) return;
    this.bounds = [r.replayStart / r.fps, r.replayEnd / r.fps];
    if (video.dataset['src'] !== r.src) { video.src = r.src; video.dataset['src'] = r.src; }
    video.preload = 'auto';
    video.removeEventListener('loadedmetadata', this.seek);
    video.play().catch(() => {});          // synchronous in the tap (iOS gesture rule)
    if (video.readyState >= 1) this.seek(); else video.addEventListener('loadedmetadata', this.seek, { once: true });
    this.isOpen.set(true);
  }

  close(): void {
    this.video?.removeEventListener('loadedmetadata', this.seek);
    this.isOpen.set(false);
    this.video?.pause();
    this.bounds = null;
  }
}
