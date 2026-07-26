export { normalizePath, safeJoin } from "@feedmind/wiki-core";

export {
  ensureDir,
  nowISO,
  sha256,
  slugify,
  safeWriteFile,
  safeUnlink,
  safeRename,
  readDirRecursive,
  countFiles,
  dateSortDesc,
  ensureRuntimeDir,
  validateSpaceId,
  readSourceTitle,
  getSpaceDir as spaceDir,
  getWikiRootDir as wikiRootDir,
} from "./space-fs/index.js";
