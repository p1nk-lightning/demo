// 前端领域类型:跨端契约 re-export 自 shared/contracts(单一来源),
// 仅前端本地的视图扩展字段(localId/ownerId/isFavorite 等)留在本文件。
export type {
  Difficulty,
  WordSource,
  ArticleTopic,
  ModelProvider,
  Question,
  Word,
  VocabularyListWire,
  VocabularyItemWire,
  ArticleWire,
  UserProgressWire,
  SyncPayload,
  GenerateRequestWire,
  DictionaryItem,
} from '@shared/contracts';
import type {
  VocabularyListWire,
  VocabularyItemWire,
  ArticleWire,
  UserProgressWire,
  GenerateRequestWire,
} from '@shared/contracts';

/** 词库列表的本地视图:云端线缆形 + Dexie/本地扩展字段。 */
export interface VocabularyList extends VocabularyListWire {
  ownerId?: string | null;
  /** 现行库固定 2;保留字面量以兼容既有持久化数据。 */
  schemaVersion: 2;
}

/** 词条目的本地视图:云端线缆形 + 本地扩展字段。 */
export interface VocabularyItem extends VocabularyItemWire {
  id: string;
  ownerId?: string | null;
}

/** 文章的本地视图:云端线缆形 + Dexie 主键与 UI 附属字段。 */
export interface Article extends Omit<ArticleWire, 'id'> {
  id: string;
  /** IndexedDB-only key;云端稳定身份仍是 id。 */
  localId?: string;
  ownerId?: string | null;
  contentId?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  isFavorite?: boolean;
}

/** 阅读进度的本地视图:云端线缆形 + 本地扩展字段。 */
export interface UserProgress extends UserProgressWire {
  ownerId?: string | null;
}

/** 生成请求的本地形:前端在发送前不一定填 default 字段。 */
export type GenerateRequest = GenerateRequestWire;

/** 词典查询条目(前端本地形,fetchedAt 为本地缓存时间戳)。 */
export interface DictEntry {
  word: string;
  queriedWord?: string;
  phonetic?: string;
  partOfSpeech?: string;
  dictionaryName?: string;
  definitionEN?: string;
  meaningCN: string;
  exampleEN?: string;
  fetchedAt: number;
}
