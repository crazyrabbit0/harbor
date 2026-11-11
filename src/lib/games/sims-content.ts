import { invoke } from "@tauri-apps/api/core";
import type { SimsPackSelection } from "./sims-packs";

import type { SimsContentMatch, SimsContentReport } from "@/lib/generated/games-sims-ipc";
export type { SimsContentMatch, SimsContentReport };

export const simsTrayContent = (
  profile: string,
  path: string,
  id: string,
  operationId: string,
  installation: SimsPackSelection | null,
) =>
  invoke<SimsContentReport>("games_sims_tray_content", {
    profile,
    path,
    id,
    operationId,
    installation,
  });
