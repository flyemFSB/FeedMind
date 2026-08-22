export {
  validateSpaceId,
  getWikiRootDir,
  getSpaceDir,
  getWikiDir,
  getRawSourcesDir,
  getRawUploadsDir,
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
  SYSTEM_FILES,
  isSystemFile,
} from "./internal/io.js";

export {
  createSpaceDirs,
  readRegistry,
  writeRegistry,
  readSpaceMeta,
  writeSpaceMeta,
  deleteSpaceDir,
  ensureRuntimeDir,
} from "./internal/space-ops.js";

export {
  invalidatePageCache,
  findPageById,
  walkPages,
  readPage,
  readPageListItem,
  readPageRaw,
} from "./internal/page-fs.js";

export {
  walkUploads,
  sourcePageCounts,
  slugFromName,
  findSourceBySlug,
  collectSourceIdentifiers,
  readSource,
  readSourceListItem,
  readSourceTitle,
  hasDuplicateSourceName,
} from "./internal/source-fs.js";
