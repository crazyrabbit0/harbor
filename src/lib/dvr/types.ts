import type { DvrSession } from "@/lib/generated/dvr-ipc";

export type { DvrSession };

export type DvrStartArgs = {
  url: string;
  outputDir: string;
  filename: string;
  durationSec: number;
  channelName: string;
  programTitle: string | null;
};
