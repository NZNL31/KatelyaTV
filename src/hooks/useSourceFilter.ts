/* eslint-disable no-console */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiSite } from '@/lib/config';
import {
  getStoredSourceBrowserValue,
  setStoredSourceBrowserValue,
  SOURCE_BROWSER_CHANGE_EVENT,
  SOURCE_BROWSER_STORAGE_KEY,
} from '@/lib/source-browser';

// 源分类项
export interface SourceCategory {
  type_id: string | number;
  type_name: string;
  type_pid?: string | number;
}

// 源分类响应
interface SourceCategoryResponse {
  class?: SourceCategory[];
  list?: unknown[];
  code?: number;
  msg?: string;
}

// Hook 返回类型
export interface UseSourceFilterReturn {
  // 状态
  sources: ApiSite[];
  currentSource: string; // 'auto' 或源的 key
  sourceCategories: SourceCategory[];
  isLoadingSources: boolean;
  isLoadingCategories: boolean;
  error: string | null;

  // 方法
  setCurrentSource: (sourceKey: string) => void;
  refreshSources: () => Promise<void>;
  getFilteredCategories: (
    contentType: 'movie' | 'tv' | 'anime' | 'show',
  ) => SourceCategory[];
}

export interface UseSourceFilterOptions {
  syncWithGlobal?: boolean;
}

// 内容类型到分类关键词的映射（扩展关键词以提高匹配率）
const CONTENT_TYPE_KEYWORDS: Record<string, string[]> = {
  movie: ['电影', '影片', '大片', '院线', '4K', '蓝光', '片'],
  tv: [
    '电视剧',
    '剧集',
    '连续剧',
    '国产剧',
    '美剧',
    '韩剧',
    '日剧',
    '港剧',
    '剧',
  ],
  anime: ['动漫', '动画', '番剧', '动画片', '卡通', '漫画'],
  show: ['综艺', '真人秀', '脱口秀', '晚会', '纪录片'],
};

/**
 * 数据源筛选 Hook
 * 用于获取可用源列表、源分类，实现数据源优先的筛选逻辑
 */
export function useSourceFilter(
  options: UseSourceFilterOptions = {},
): UseSourceFilterReturn {
  const { syncWithGlobal = true } = options;
  const [sources, setSources] = useState<ApiSite[]>([]);
  const [currentSource, setCurrentSourceState] = useState<string>(() =>
    syncWithGlobal ? getStoredSourceBrowserValue() : 'auto',
  );
  const [sourceCategories, setSourceCategories] = useState<SourceCategory[]>(
    [],
  );
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取可用源列表
  const fetchSources = useCallback(async () => {
    setIsLoadingSources(true);
    setError(null);
    try {
      const response = await fetch('/api/search/resources', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('获取数据源列表失败');
      }
      const data: ApiSite[] = await response.json();
      setSources(data);
    } catch (err) {
      console.error('获取数据源失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoadingSources(false);
    }
  }, []);

  // 获取指定源的分类列表
  const fetchSourceCategories = useCallback(
    async (sourceKey: string) => {
      if (sourceKey === 'auto') {
        setSourceCategories([]);
        return;
      }

      setIsLoadingCategories(true);
      setError(null);

      try {
        // 查找源配置
        const source = sources.find((s) => s.key === sourceKey);
        if (!source) {
          throw new Error('未找到指定的数据源');
        }

        // 构建分类 API URL - 资源站通用格式
        const originalApiUrl = source.api.endsWith('/')
          ? `${source.api}?ac=class`
          : `${source.api}/?ac=class`;
        const apiUrl = `/api/proxy/cms?url=${encodeURIComponent(originalApiUrl)}`;

        const response = await fetch(apiUrl, {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('获取分类列表失败');
        }

        const data: SourceCategoryResponse = await response.json();
        const categories = data.class || [];
        setSourceCategories(categories);
      } catch (err) {
        console.error('获取源分类失败:', err);
        setError(err instanceof Error ? err.message : '获取分类失败');
        setSourceCategories([]);
      } finally {
        setIsLoadingCategories(false);
      }
    },
    [sources],
  );

  // 切换当前源
  const setCurrentSource = useCallback(
    (sourceKey: string) => {
      const nextSource = sourceKey || 'auto';
      setCurrentSourceState(nextSource);
      if (syncWithGlobal) {
        setStoredSourceBrowserValue(nextSource);
      }
    },
    [syncWithGlobal],
  );

  // 根据内容类型过滤分类（带智能兜底）
  const getFilteredCategories = useCallback(
    (contentType: 'movie' | 'tv' | 'anime' | 'show'): SourceCategory[] => {
      if (sourceCategories.length === 0) {
        return [];
      }

      const keywords = CONTENT_TYPE_KEYWORDS[contentType] || [];

      // 尝试智能匹配相关分类
      let filtered = sourceCategories.filter((cat) => {
        const name = cat.type_name.toLowerCase();
        return keywords.some((keyword) => name.includes(keyword.toLowerCase()));
      });

      // 【兜底策略 1】如果没有匹配到，尝试匹配包含"片"或"剧"的分类
      if (filtered.length === 0) {
        filtered = sourceCategories.filter((cat) => {
          const name = cat.type_name;
          return (
            name.includes('片') || name.includes('剧') || name.includes('漫')
          );
        });
      }

      // 【兜底策略 2】如果仍为空，返回前 15 个分类供用户选择
      if (filtered.length === 0) {
        return sourceCategories.slice(0, 15);
      }

      return filtered;
    },
    [sourceCategories],
  );

  // 刷新源列表
  const refreshSources = useCallback(async () => {
    await fetchSources();
  }, [fetchSources]);

  // 初始化时获取源列表
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // 同步其他页面更新的数据源（源浏览器 -> 豆瓣页）
  useEffect(() => {
    if (!syncWithGlobal) return;

    const handleSourceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceKey?: string }>).detail;
      const nextSource = detail?.sourceKey || getStoredSourceBrowserValue();
      setCurrentSourceState((prev) =>
        prev === nextSource ? prev : nextSource,
      );
    };

    const handleStorageChange = (
      event: Event & { key?: string | null; newValue?: string | null },
    ) => {
      if (event.key !== SOURCE_BROWSER_STORAGE_KEY) return;
      const nextSource = event.newValue || 'auto';
      setCurrentSourceState((prev) =>
        prev === nextSource ? prev : nextSource,
      );
    };

    window.addEventListener(
      SOURCE_BROWSER_CHANGE_EVENT,
      handleSourceChange as EventListener,
    );
    window.addEventListener('storage', handleStorageChange as EventListener);
    return () => {
      window.removeEventListener(
        SOURCE_BROWSER_CHANGE_EVENT,
        handleSourceChange as EventListener,
      );
      window.removeEventListener(
        'storage',
        handleStorageChange as EventListener,
      );
    };
  }, [syncWithGlobal]);

  // 当前源变化后自动拉取分类（用于源浏览器统一控制）
  useEffect(() => {
    if (currentSource === 'auto') {
      setSourceCategories([]);
      return;
    }
    if (sources.length === 0) return;
    fetchSourceCategories(currentSource);
  }, [currentSource, sources.length, fetchSourceCategories]);

  return {
    sources,
    currentSource,
    sourceCategories,
    isLoadingSources,
    isLoadingCategories,
    error,
    setCurrentSource,
    refreshSources,
    getFilteredCategories,
  };
}

export default useSourceFilter;
