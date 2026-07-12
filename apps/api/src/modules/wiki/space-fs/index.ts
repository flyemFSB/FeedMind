export {
  validateSpaceId,
  getWikiRootDir,
  getSpaceDir,
  getWikiDir,
  getSourceFilePath,
  normalizePageRelPath,
} from "./internal/paths.js";

export {
  ensureDir,
  safeWriteFile,
  safeUnlink,
  safeRename,
  readDirRecursive,
  countFiles,
  collectFileEntries,
  nowISO,
  sha256,
  slugify,
  dateSortDesc,
} from "./internal/io.js";

export {
  createSpaceDirs,
  readRegistry,
  writeRegistry,
  readSpaceMeta,
  writeSpaceMeta,
  deleteSpaceDir,
  ensureLlmWikiDir,
} from "./internal/space-ops.js";

export {
  invalidatePageCache,
  findPageBySlug,
  walkPages,
  readPage,
  readPageListItem,
  readPageRaw,
} from "./internal/page-fs.js";

export {
  walkSources,
  sourcePageCounts,
  findSourceBySlug,
  readSource,
  readSourceListItem,
  readSourceTitle,
} from "./internal/source-fs.js";
