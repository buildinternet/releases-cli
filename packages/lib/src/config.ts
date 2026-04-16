import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

let _dataDir: string | null = null;

export function getDataDir(): string {
  if (!_dataDir) {
    _dataDir = process.env.RELEASED_DATA_DIR || join(homedir(), ".releases");
    mkdirSync(_dataDir, { recursive: true });
  }
  return _dataDir;
}

export function getLogsDir(): string {
  const dir = join(getDataDir(), "logs");
  mkdirSync(dir, { recursive: true });
  return dir;
}
