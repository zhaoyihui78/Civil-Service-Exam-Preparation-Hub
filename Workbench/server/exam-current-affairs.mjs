const GOV_ORIGIN = "https://www.gov.cn";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;

export const EXAM_CURRENT_AFFAIRS_SOURCES = Object.freeze([
  {
    id: "gov-important-news",
    label: "中国政府网·要闻",
    category: "时政要闻",
    url: `${GOV_ORIGIN}/yaowen/liebiao/YAOWENLIEBIAO.json`,
  },
  {
    id: "gov-latest-policy",
    label: "中国政府网·最新政策",
    category: "政策文件",
    url: `${GOV_ORIGIN}/zhengce/zuixin/ZUIXINZHENGCE.json`,
  },
]);

const THEMES = [
  {
    id: "theory-party",
    label: "理论与党建",
    patterns: [/马克思|新时代中国特色社会主义|党中央|全会|党建|党纪|党史|总书记|习近平/],
    angle: "结合党的创新理论、人民立场和实践观点，梳理政治方向与治理要求。",
  },
  {
    id: "governance",
    label: "国家治理",
    patterns: [/国务院|治理|改革|法治|监督|行政|政务|公共服务|基层|社会治理/],
    angle: "提炼治理主体、制度机制、执行链条与监督反馈，可用于申论对策和面试分析。",
  },
  {
    id: "economy",
    label: "经济发展",
    patterns: [/经济|消费|投资|金融|财政|产业|就业|民营|营商|市场|企业|贸易/],
    angle: "从发展与安全、有效市场与有为政府、就业民生等关系分析政策作用。",
  },
  {
    id: "livelihood",
    label: "民生保障",
    patterns: [/教育|医疗|养老|社保|住房|生育|托育|就业|收入|乡村振兴|残疾|救助/],
    angle: "围绕群众需求、公共服务均等化和政策落地最后一公里组织观点。",
  },
  {
    id: "ecology",
    label: "生态文明",
    patterns: [/生态|环境|绿色|低碳|碳达峰|污染|自然资源|美丽中国/],
    angle: "用系统观念处理发展与保护关系，关注制度约束、协同治理和长效机制。",
  },
  {
    id: "culture",
    label: "文化建设",
    patterns: [/文化|文物|遗产|文明|旅游|体育|价值观|思想政治/],
    angle: "从文化自信、公共文化服务与创造性转化角度积累申论素材。",
  },
  {
    id: "security",
    label: "安全与应急",
    patterns: [/安全|应急|风险|灾害|防汛|消防|粮食安全|能源安全|国家安全/],
    angle: "按照底线思维梳理风险识别、预警、处置、复盘和责任落实。",
  },
];

function compactText(value, maximum = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normalizeUrl(value) {
  try {
    const parsed = new URL(String(value ?? ""), GOV_ORIGIN);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeDate(value) {
  const raw = compactText(value, 40);
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function matchedThemes(title) {
  return THEMES.filter((theme) => theme.patterns.some((pattern) => pattern.test(title)));
}

function priorityFor({ category, title, themes }) {
  let score = category === "政策文件" ? 4 : 0;
  score += Math.min(themes.length, 3);
  if (/中共中央|国务院|全会|意见|办法|规划|条例|决定|通知|习近平|总书记|重要讲话|《求是》/.test(title)) score += 2;
  if (/发布会|权威解读|工作报告|白皮书/.test(title)) score += 1;
  return score;
}

function reasonFor(item) {
  if (item.category === "政策文件") {
    return `官方政策原文，适合提炼“背景—目标—举措—保障”并积累${item.themeLabel}素材。`;
  }
  if (item.themes.length > 0) {
    return `涉及${item.themes.map((theme) => theme.label).join("、")}，可用于申论论据和结构化面试分析。`;
  }
  return "中央权威要闻，建议先掌握基本事实，再判断是否进入专题积累。";
}

function normalizeItem(raw, source, index) {
  const title = compactText(raw?.TITLE ?? raw?.title, 240);
  const original = normalizeUrl(raw?.URL ?? raw?.url);
  if (!title || !original) return null;
  const themes = matchedThemes(title);
  const item = {
    id: `${source.id}-${index + 1}`,
    kind: source.category === "政策文件" ? "policy" : "news",
    title,
    summary: compactText(raw?.SUB_TITLE ?? raw?.summary, 500) || null,
    publishedAt: normalizeDate(raw?.DOCRELPUBTIME ?? raw?.publishedAt),
    latestAt: normalizeDate(raw?.DOCRELPUBTIME ?? raw?.publishedAt),
    category: source.category,
    categoryLabel: source.category,
    source: { name: source.label },
    evidence: { level: "official", label: "中央政府官方来源" },
    themes: themes.map(({ id, label, angle }) => ({ id, label, angle })),
    themeLabel: themes[0]?.label || "综合时政",
    links: { original },
  };
  const score = priorityFor({ ...item, themes });
  return {
    ...item,
    score,
    attention: {
      domains: themes.map(({ id, label }) => ({ id, label })),
      reason: reasonFor(item),
    },
    examAngle: themes[0]?.angle || "先概括事实，再分析影响、治理难点与可执行对策。",
  };
}

async function fetchJson(fetchImpl, source, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(source.url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CivilServiceWorkbench/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`${source.label}返回 HTTP ${response.status}`);
      error.code = "CURRENT_AFFAIRS_UPSTREAM_ERROR";
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      const error = new Error(`${source.label}返回了无法识别的数据格式`);
      error.code = "CURRENT_AFFAIRS_INVALID_PAYLOAD";
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function uniqueItems(items) {
  const seenTitles = new Set();
  const seenUrls = new Set();
  return items.filter((item) => {
    const titleKey = item.title
      .replace(/[《》“”‘’"'，,。；;：:\s]/g, "")
      .replace(/印发/g, "")
      .toLocaleLowerCase("zh-CN");
    const urlKey = item.links.original;
    if (seenTitles.has(titleKey) || seenUrls.has(urlKey)) return false;
    seenTitles.add(titleKey);
    seenUrls.add(urlKey);
    return true;
  });
}

export function classifyExamCurrentAffairs(sourceResults) {
  const normalized = sourceResults.flatMap(({ source, payload }) =>
    payload.slice(0, 60).map((raw, index) => normalizeItem(raw, source, index)).filter(Boolean),
  ).sort((left, right) => {
    const dateOrder = String(right.publishedAt ?? "").localeCompare(String(left.publishedAt ?? ""));
    return dateOrder || right.score - left.score;
  });
  const items = uniqueItems(normalized);

  const mustRead = items.filter((item) => item.score >= 3).slice(0, 6);
  const used = new Set(mustRead.map((item) => item.id));
  const browse = items.filter((item) => !used.has(item.id) && item.score >= 1).slice(0, 12);
  browse.forEach((item) => used.add(item.id));
  const other = items.filter((item) => !used.has(item.id)).slice(0, 12);
  return { mustRead, browse, other, total: items.length };
}

export function createExamCurrentAffairsService({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  sources = EXAM_CURRENT_AFFAIRS_SOURCES,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("时政服务需要 fetch 实现。");
  let cache = null;

  return {
    async load({ force = false } = {}) {
      const requestedAt = now();
      if (!force && cache && requestedAt < cache.expiresAt) return cache.payload;
      try {
        const settled = await Promise.allSettled(
          sources.map(async (source) => ({
            source,
            payload: await fetchJson(fetchImpl, source, requestTimeoutMs),
          })),
        );
        const fulfilled = settled
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);
        if (fulfilled.length === 0) throw settled[0]?.reason || new Error("官方时政源暂不可用");

        const tiers = classifyExamCurrentAffairs(fulfilled);
        const fetchedAt = new Date(requestedAt).toISOString();
        const payload = {
          schemaVersion: 1,
          status: "live",
          fetchedAt,
          expiresAt: new Date(requestedAt + cacheTtlMs).toISOString(),
          source: {
            name: "中国政府网",
            url: GOV_ORIGIN,
            attributionRequired: true,
          },
          sources: settled.map((result, index) => ({
            id: sources[index].id,
            label: sources[index].label,
            url: sources[index].url,
            status: result.status === "fulfilled" ? "live" : "unavailable",
          })),
          counts: {
            upstream: tiers.total,
            mustRead: tiers.mustRead.length,
            browse: tiers.browse.length,
            other: tiers.other.length,
          },
          tiers: {
            mustRead: tiers.mustRead,
            browse: tiers.browse,
            other: tiers.other,
          },
        };
        cache = { expiresAt: requestedAt + cacheTtlMs, payload };
        return payload;
      } catch (error) {
        if (cache?.payload) {
          return {
            ...cache.payload,
            status: "stale",
            staleAt: new Date(requestedAt).toISOString(),
            error: {
              code: error?.code || "CURRENT_AFFAIRS_REFRESH_FAILED",
              message: error?.message || "官方时政数据刷新失败。",
            },
          };
        }
        error.code ||= "CURRENT_AFFAIRS_UNAVAILABLE";
        throw error;
      }
    },
  };
}
