import { randomUUID } from 'node:crypto';
import { JsonStore } from './jsonStore.js';

export type JobStatus = 'queued' | 'downloading' | 'clipping' | 'uploading' | 'done' | 'failed';

export type ClipPreset = 'showreel' | 'social' | 'recap';
export type AspectRatio = '9:16' | '1:1' | '16:9';

export interface ClipResult {
  clipId: string;
  title: string;
  aspectRatio: AspectRatio;
  durationMs: number;
  /** Vault media uuid once the clip has been uploaded back. */
  mediaUuid?: string;
  /** False when the source is flagged NSFW: clip stays in the Vault, social export is blocked. */
  socialExportAllowed: boolean;
}

export interface Job {
  id: string;
  creatorId: string;
  sourceMediaUuid: string;
  preset: ClipPreset;
  aspectRatios: AspectRatio[];
  status: JobStatus;
  error?: string;
  minutesCharged: number;
  clips: ClipResult[];
  createdAt: number;
  updatedAt: number;
}

const store = new JsonStore<Job>('jobs');

export function createJob(input: {
  creatorId: string;
  sourceMediaUuid: string;
  preset: ClipPreset;
  aspectRatios: AspectRatio[];
  minutesCharged: number;
}): Job {
  const job: Job = {
    id: randomUUID(),
    ...input,
    status: 'queued',
    clips: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set(job.id, job);
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): Job {
  const current = store.get(id);
  if (!current) throw new Error(`unknown job ${id}`);
  const next: Job = { ...current, ...patch, updatedAt: Date.now() };
  store.set(id, next);
  return next;
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

export function listJobs(creatorId: string): Job[] {
  return store
    .values()
    .filter((job) => job.creatorId === creatorId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
