// Optional automatic ML pass after scans. Only runs when the required models
// are downloaded; processes a small batch per call so it never monopolizes the
// phone. Manual controls remain in Maintenance.

import { allModelStatuses } from "./mlModels";
import { tagScenesOnDevice } from "./sceneTag";
import { buildPeopleIndex } from "./faceEngine";

let running = false;

export async function runAutoMlIndex(batch = 10): Promise<void> {
  if (running) return;
  running = true;
  try {
    const statuses = await allModelStatuses();
    const ready = new Set(statuses.filter((s) => s.downloaded).map((s) => s.id));
    if (ready.has("scene") && ready.has("imagenet-labels")) {
      await tagScenesOnDevice(batch);
    }
    if (ready.has("face-detect") && ready.has("face-embed")) {
      await buildPeopleIndex(Math.max(1, Math.min(5, batch)));
    }
  } catch {
    // Automatic indexing is best-effort; Maintenance surfaces errors manually.
  } finally {
    running = false;
  }
}
