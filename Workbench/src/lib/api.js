import {
  fallbackCollections,
  fallbackDouyinWorks,
  fallbackOverview,
  fallbackSearchResults,
} from "../data/fallback";
import {
  httpApiError,
  normalizeApiFailure,
} from "./api-errors";

const DEFAULT_TIMEOUT = 12_000;
const HOSTED = import.meta.env.VITE_WORKBENCH_HOSTED === "true";
let hostedDataPromise = null;

function hostedReadOnlyError() {
  const error = new Error("线上版本为公开只读展示；请在本机工作台中修改私人数据。");
  error.code = "HOSTED_READ_ONLY";
  return error;
}

async function loadHostedData() {
  if (!hostedDataPromise) {
    hostedDataPromise = fetch(`${import.meta.env.BASE_URL}hosted-data.json`, {
      headers: { Accept: "application/json" },
    }).then((response) => {
      if (!response.ok) throw new Error("公开展示数据加载失败。");
      return response.json();
    });
  }
  return hostedDataPromise;
}

function hostedSearch(data, url) {
  const query = String(url.searchParams.get("q") || "").trim().toLocaleLowerCase("zh-CN");
  const items = data.searchDocuments.filter((item) => {
    if (!query) return true;
    const haystack = `${item.title || ""} ${item.section || ""} ${item.excerpt || ""} ${(item.tags || []).join(" ")}`
      .toLocaleLowerCase("zh-CN");
    return query.split(/\s+/).every((term) => haystack.includes(term));
  });
  return { query, total: items.length, items: items.slice(0, 100) };
}

async function hostedRequest(path, options = {}) {
  if ((options.method || "GET").toUpperCase() !== "GET") {
    throw hostedReadOnlyError();
  }

  const data = await loadHostedData();
  const url = new URL(path, window.location.origin);
  if (url.pathname === "/api/overview") return data.overview;
  if (url.pathname === "/api/exam/dashboard") return data.examDashboard;
  if (url.pathname === "/api/exam/opportunities") return data.examOpportunities;
  if (url.pathname === "/api/materials") return data.materials;
  if (url.pathname === "/api/materials/folder") {
    return data.materialFolders[url.searchParams.get("path") || "10_raw"] || {
      generatedAt: data.generatedAt,
      folder: null,
      breadcrumbs: [],
      folders: [],
      items: [],
    };
  }
  if (url.pathname === "/api/material-reading-queue") return data.materialReadingQueue;
  if (url.pathname === "/api/books") return data.books;
  if (url.pathname === "/api/graph") return data.graph;
  if (url.pathname === "/api/runtime") return data.runtime;
  if (url.pathname === "/api/search") return hostedSearch(data, url);
  if (url.pathname.startsWith("/api/collections/")) {
    const kind = decodeURIComponent(url.pathname.slice("/api/collections/".length));
    return data.collections[kind] || { total: 0, groups: [], items: [] };
  }
  if (url.pathname.startsWith("/api/documents/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/documents/".length));
    const document = data.documents[id];
    if (document) return document;
    throw new Error("公开展示中没有这篇文档。");
  }
  throw new Error("该功能仅在本机工作台中可用。");
}

async function request(path, options = {}) {
  if (HOSTED) return hostedRequest(path, options);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT);

  try {
    let response;
    try {
      response = await fetch(path, {
        ...options,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw normalizeApiFailure(error);
    }

    if (!response.ok) {
      const body = await response.text();
      throw httpApiError(
        response.status,
        body,
        response.headers.get("content-type") || "",
      );
    }

    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function withFallback(loader, fallback) {
  try {
    const data = await loader();
    return { data, source: "live", error: null };
  } catch (error) {
    return {
      data: typeof fallback === "function" ? fallback() : fallback,
      source: "fallback",
      error,
    };
  }
}

export function loadOverview() {
  return withFallback(() => request("/api/overview"), fallbackOverview);
}

export function loadExamDashboard() {
  return request("/api/exam/dashboard");
}

export function loadExamOpportunities() {
  return request("/api/exam/opportunities");
}

export function createExamOpportunity(opportunity) {
  return request("/api/exam/opportunities", {
    method: "POST",
    body: JSON.stringify(opportunity),
  });
}

export function deleteExamOpportunity(opportunityId) {
  return request(`/api/exam/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: "DELETE",
  });
}

export function importExamOpportunities(payload) {
  return request("/api/exam/opportunities/import", {
    method: "POST",
    body: JSON.stringify(payload),
    timeout: 45_000,
  });
}

export function updateExamProfile(profile) {
  return request("/api/exam/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export function createExamTask(task) {
  return request("/api/exam/tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });
}

export function updateExamTask(taskId, updates) {
  return request(`/api/exam/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteExamTask(taskId) {
  return request(`/api/exam/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

export function createStudyLog(log) {
  return request("/api/exam/logs", {
    method: "POST",
    body: JSON.stringify(log),
  });
}

export async function loadDailyHot({ refresh = false } = {}) {
  return withFallback(
    () => request(`/api/exam/current-affairs${refresh ? "?refresh=1" : ""}`, {
      timeout: 25_000,
    }),
    {
      schemaVersion: 1,
      status: "unavailable",
      fetchedAt: null,
      source: { name: "中国政府网", url: "https://www.gov.cn/" },
      sources: [],
      counts: { upstream: null, mustRead: 0, browse: 0, other: 0 },
      tiers: { mustRead: [], browse: [], other: [] },
      error: { message: "官方时政数据暂时无法读取。" },
    },
  );
}

export function loadCollection(kind, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  return withFallback(
    () => request(`/api/collections/${kind}?${search.toString()}`),
    () => {
      const overviewRows =
        kind === "wiki"
          ? fallbackSearchResults.filter((item) => item.layer === "wiki")
          : kind === "materials"
            ? fallbackSearchResults.filter((item) => item.layer === "raw")
            : kind === "archive"
              ? fallbackSearchResults.filter((item) => item.layer === "run")
              : fallbackSearchResults;

      return {
        items: overviewRows,
        groups: fallbackCollections[kind] ?? [],
        total: overviewRows.length,
      };
    },
  );
}

const emptyMaterialsHome = {
  generatedAt: null,
  root: null,
  folders: [],
  queue: [],
  queuePreview: [],
  recent: [],
  total: 0,
};

export function loadMaterialsHome() {
  return withFallback(() => request("/api/materials"), emptyMaterialsHome);
}

export function loadBooks() {
  return withFallback(
    () => request("/api/books"),
    { generatedAt: null, total: 0, chapterTotal: 0, books: [] },
  );
}

export function loadMaterialFolder(relativePath) {
  const search = new URLSearchParams({ path: relativePath });
  return withFallback(
    () => request(`/api/materials/folder?${search.toString()}`),
    {
      generatedAt: null,
      folder: null,
      breadcrumbs: [],
      folders: [],
      items: [],
    },
  );
}

export function loadMaterialReadingQueue() {
  return withFallback(
    () => request("/api/material-reading-queue"),
    { updatedAt: null, total: 0, items: [] },
  );
}

export function addMaterialToReadingQueue(documentId, contentHash = undefined) {
  return request("/api/material-reading-queue", {
    method: "POST",
    body: JSON.stringify({
      documentId,
      ...(contentHash ? { contentHash } : {}),
    }),
  });
}

export function removeMaterialFromReadingQueue(documentId) {
  return request(`/api/material-reading-queue/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
}

export function searchVault(query, filters = {}) {
  const search = new URLSearchParams({ q: query });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) search.set(key, String(value));
  });

  return withFallback(
    () => request(`/api/search?${search.toString()}`),
    () => ({
      query,
      total: fallbackSearchResults.filter((item) => {
        const haystack = `${item.title} ${item.section} ${item.excerpt ?? ""}`.toLowerCase();
        return !query || haystack.includes(query.toLowerCase());
      }).length,
      items: fallbackSearchResults.filter((item) => {
        const haystack = `${item.title} ${item.section} ${item.excerpt ?? ""}`.toLowerCase();
        return !query || haystack.includes(query.toLowerCase());
      }),
    }),
  );
}

export function loadDocument(id) {
  return withFallback(
    () => request(`/api/documents/${encodeURIComponent(id)}`),
    null,
  );
}

export function loadReaderNotes(documentId) {
  const search = new URLSearchParams({ documentId: String(documentId) });
  return request(`/api/reader-notes?${search.toString()}`);
}

export function saveReaderNote(payload) {
  return request("/api/reader-notes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteReaderNote(noteId, documentId) {
  const search = new URLSearchParams({ documentId: String(documentId) });
  return request(
    `/api/reader-notes/${encodeURIComponent(noteId)}?${search.toString()}`,
    { method: "DELETE" },
  );
}

export function loadReaderExplanations(documentId) {
  const search = new URLSearchParams({ documentId: String(documentId) });
  return request(`/api/reader-explanations?${search.toString()}`);
}

export function loadReaderExplanation(analysisId, documentId) {
  const search = new URLSearchParams({ documentId: String(documentId) });
  return request(
    `/api/reader-explanations/${encodeURIComponent(analysisId)}?${search.toString()}`,
  );
}

export function startReaderExplanation(payload) {
  return request("/api/reader-explanations", {
    method: "POST",
    body: JSON.stringify(payload),
    timeout: 30_000,
  });
}

export function followUpReaderExplanation(analysisId, payload) {
  return request(
    `/api/reader-explanations/${encodeURIComponent(analysisId)}/follow-up`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      timeout: 30_000,
    },
  );
}

export function saveReaderExplanationToNote(analysisId, payload) {
  return request(
    `/api/reader-explanations/${encodeURIComponent(analysisId)}/save-note`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      timeout: 30_000,
    },
  );
}

export function startWikiIngest(documentId) {
  return request("/api/wiki-ingest", {
    method: "POST",
    body: JSON.stringify({ documentId }),
    timeout: 30_000,
  });
}

export function loadWikiIngestJob(jobId) {
  return request(`/api/wiki-ingest/jobs/${encodeURIComponent(jobId)}`);
}

export function loadWikiIngestRecovery(documentId) {
  return request(`/api/wiki-ingest/recovery?documentId=${encodeURIComponent(documentId)}`);
}

export function sendWikiIngestMessage(jobId, message, kind = "query") {
  return request(`/api/wiki-ingest/jobs/${encodeURIComponent(jobId)}/message`, {
    method: "POST",
    body: JSON.stringify({ message, kind }),
    timeout: 30_000,
  });
}

export function confirmWikiIngestJob(jobId, expectedReviewVersion) {
  return request(`/api/wiki-ingest/jobs/${encodeURIComponent(jobId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ expectedReviewVersion }),
    timeout: 30_000,
  });
}

export function createWikiIngestClientHandoff(jobId, expectedReviewVersion) {
  return request(`/api/wiki-ingest/jobs/${encodeURIComponent(jobId)}/handoff`, {
    method: "POST",
    body: JSON.stringify({ expectedReviewVersion }),
    timeout: 30_000,
  });
}

export function cancelWikiIngestJob(jobId) {
  return request(`/api/wiki-ingest/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    timeout: 30_000,
  });
}

export function createWikiIngestEventSource(jobId) {
  return new EventSource(`/api/wiki-ingest/jobs/${encodeURIComponent(jobId)}/events`);
}

export function loadGraph() {
  return withFallback(() => request("/api/graph"), {
    generatedAt: null,
    stats: { nodeCount: 0, edgeCount: 0, isolatedCount: 0 },
    typeCounts: {},
    nodes: [],
    edges: [],
  });
}

export function loadDouyinWorks(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, String(value));
  });

  return withFallback(
    () => request(`/api/douyin/works?${search.toString()}`),
    {
      generatedAt: null,
      total: fallbackDouyinWorks.length,
      items: fallbackDouyinWorks,
      comparableCount: null,
      summary: {},
      summaryLowerBounds: {},
      contentLines: [],
      formats: [],
      roles: [],
      monthly: [],
      reviewStatusCounts: {
        public: null,
        private: null,
      },
      available: false,
      sourcePath: null,
      sourceUpdatedAt: null,
      range: {
        from: null,
        to: null,
      },
      qualityIssues: [],
      qualityFlags: ["data_service_unavailable"],
      analytics: null,
    },
  );
}

export function loadSocialInsights() {
  return withFallback(
    () => request("/api/social-insights"),
    {
      available: false,
      generatedAt: null,
      total: null,
      items: [],
    },
  );
}

export function loadSocialInsight(reportId) {
  return withFallback(
    () => request(`/api/social-insights/${encodeURIComponent(reportId)}`),
    null,
  );
}

export function loadSocialTrends() {
  return withFallback(
    () => request("/api/social-trends"),
    {
      available: false,
      generatedAt: null,
      total: null,
      items: [],
    },
  );
}

export function loadSocialTrend(reportId) {
  return withFallback(
    () => request(`/api/social-trends/${encodeURIComponent(reportId)}`),
    null,
  );
}

export function refreshVault() {
  return request("/api/refresh", { method: "POST" });
}

export function openLocalTarget(id, target = "obsidian") {
  return request("/api/open", {
    method: "POST",
    body: JSON.stringify({ id, target }),
  });
}

export function getRuntimeStatus() {
  return withFallback(
    () => request("/api/runtime"),
    {
      codex: {
        available: false,
        authenticated: null,
        version: null,
        path: null,
      },
      vault: {
        connected: null,
        label: "本地 Vault",
        documents: null,
        generatedAt: null,
        errors: null,
      },
    },
  );
}

export function startWorkflow(payload) {
  return request("/api/workflows/xiaohongshu", {
    method: "POST",
    body: JSON.stringify(payload),
    timeout: 30_000,
  });
}

export function loadWorkflowJob(jobId) {
  return request(`/api/workflows/jobs/${encodeURIComponent(jobId)}`);
}

export function cancelWorkflowJob(jobId) {
  return request(`/api/workflows/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
}

export function confirmWorkflowJob(jobId) {
  return request(`/api/workflows/jobs/${encodeURIComponent(jobId)}/confirm`, {
    method: "POST",
  });
}

export function createJobEventSource(jobId) {
  return new EventSource(`/api/workflows/jobs/${encodeURIComponent(jobId)}/events`);
}
