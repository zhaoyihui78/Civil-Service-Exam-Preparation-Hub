import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const EXAM_OPPORTUNITIES_PATH = "20_exam/.exam-opportunities.json";
export const CUSTOM_EXAM_OPPORTUNITIES_PATH = "20_exam/.exam-opportunities.custom.json";

const EMPTY_RESULT = { updatedAt: null, notice: "暂无岗位数据。", items: [] };
const MAX_CUSTOM_ITEMS = 10_000;
const MAX_IMPORT_ITEMS = 5_000;

function opportunityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanUrl(value, { required = false } = {}) {
  const url = String(value ?? "").trim();
  if (!url && !required) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
  } catch {
    // The user-facing validation error is produced below.
  }
  if (required) throw opportunityError("INVALID_EXAM_OPPORTUNITY", "请填写有效的 http(s) 岗位链接。");
  return null;
}

function cleanText(value, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

function requiredText(value, label, maximum) {
  const text = String(value ?? "").trim();
  if (!text) throw opportunityError("INVALID_EXAM_OPPORTUNITY", `请填写${label}。`);
  if (text.length > maximum) {
    throw opportunityError("INVALID_EXAM_OPPORTUNITY", `${label}不能超过 ${maximum} 个字符。`);
  }
  return text;
}

function normalizeItem(value, index, origin = "curated") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const unit = cleanText(value.unit, 120);
  const role = cleanText(value.role, 160);
  const url = cleanUrl(value.url);
  if (!unit || !role || !url) return null;
  return {
    id: cleanText(value.id, 100) || `opportunity-${index + 1}`,
    examType: cleanText(value.examType, 20) || "省考",
    region: cleanText(value.region, 30),
    city: cleanText(value.city, 30),
    unit,
    role,
    code: cleanText(value.code, 60),
    fit: cleanText(value.fit, 500),
    requirements: cleanText(value.requirements, 500),
    status: cleanText(value.status, 80) || "待确认",
    sourceLabel: cleanText(value.sourceLabel, 80) || "官方来源",
    url,
    origin: origin === "custom" && value.origin === "imported" ? "imported" : origin === "custom" ? "manual" : origin,
    sourceFile: cleanText(value.sourceFile, 160),
    matchScore: Number.isFinite(Number(value.matchScore)) ? Math.max(0, Math.min(100, Number(value.matchScore))) : null,
    createdAt: cleanText(value.createdAt, 40) || null,
  };
}

async function readJson(filePath, fallback, corruptMessage) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw opportunityError("EXAM_OPPORTUNITIES_CORRUPT", corruptMessage);
  }
}

export function createExamOpportunitiesRepository({ vaultRoot, now = () => new Date() }) {
  const root = path.resolve(vaultRoot);
  const filePath = path.join(root, EXAM_OPPORTUNITIES_PATH);
  const customFilePath = path.join(root, CUSTOM_EXAM_OPPORTUNITIES_PATH);
  let mutationQueue = Promise.resolve();

  async function readBase() {
    const parsed = await readJson(filePath, EMPTY_RESULT, "岗位数据无法读取，请检查本地岗位文件格式。");
    return {
      updatedAt: cleanText(parsed?.updatedAt, 40) || null,
      notice: cleanText(parsed?.notice, 500) || EMPTY_RESULT.notice,
      items: Array.isArray(parsed?.items)
        ? parsed.items.map((item, index) => normalizeItem(item, index, "curated")).filter(Boolean)
        : [],
    };
  }

  async function readCustom() {
    const parsed = await readJson(customFilePath, { updatedAt: null, items: [] }, "自己添加的岗位无法读取，请检查本地岗位文件格式。");
    return {
      updatedAt: cleanText(parsed?.updatedAt, 40) || null,
      items: Array.isArray(parsed?.items)
        ? parsed.items.map((item, index) => normalizeItem(item, index, "custom")).filter(Boolean)
        : [],
    };
  }

  async function writeCustom(items) {
    if (items.length > MAX_CUSTOM_ITEMS) {
      throw opportunityError("EXAM_OPPORTUNITIES_LIMIT", "自己添加的岗位数量已达到当前版本上限。");
    }
    const next = { schemaVersion: 1, updatedAt: now().toISOString(), items };
    await mkdir(path.dirname(customFilePath), { recursive: true });
    const temporaryPath = `${customFilePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, customFilePath);
    return next;
  }

  function mutate(operation) {
    const result = mutationQueue.then(async () => operation(await readCustom()));
    mutationQueue = result.catch(() => {});
    return result;
  }

  async function list() {
    const [base, custom] = await Promise.all([readBase(), readCustom()]);
    return {
      updatedAt: custom.updatedAt || base.updatedAt,
      notice: base.notice,
      items: [...custom.items, ...base.items],
      customCount: custom.items.length,
    };
  }

  return {
    list,
    add(input) {
      return mutate(async (custom) => {
        const url = cleanUrl(input.url, { required: true });
        const sourceLabel = cleanText(input.sourceLabel, 80)
          || (new URL(url).hostname.includes("gongkaoleida") ? "公考雷达" : "手动添加");
        const createdAt = now().toISOString();
        const item = {
          id: `manual-${randomUUID()}`,
          origin: "manual",
          examType: cleanText(input.examType, 20) || "省考",
          region: cleanText(input.region, 30),
          city: requiredText(input.city, "具体地区", 30),
          unit: requiredText(input.unit, "招录单位", 120),
          role: requiredText(input.role, "岗位名称", 160),
          code: cleanText(input.code, 60),
          fit: cleanText(input.fit, 500),
          requirements: cleanText(input.requirements, 500),
          status: cleanText(input.status, 80) || "待确认",
          sourceLabel,
          url,
          createdAt,
        };
        await writeCustom([item, ...custom.items]);
        return list();
      });
    },
    importBatch(input) {
      return mutate(async (custom) => {
        if (!Array.isArray(input.items) || !input.items.length) {
          throw opportunityError("INVALID_EXAM_OPPORTUNITY_IMPORT", "职位表中没有可导入的岗位。");
        }
        if (input.items.length > MAX_IMPORT_ITEMS) {
          throw opportunityError("INVALID_EXAM_OPPORTUNITY_IMPORT", `单次最多导入 ${MAX_IMPORT_ITEMS} 个岗位，请先按专业或地区筛选。`);
        }
        const examType = cleanText(input.examType, 20) || "省考";
        const region = cleanText(input.region, 30);
        const sourceLabel = cleanText(input.sourceLabel, 80) || "官方职位表";
        const sourceFile = requiredText(input.sourceFile, "文件名称", 160);
        const url = cleanUrl(input.sourceUrl, { required: true });
        const createdAt = now().toISOString();
        const existingKeys = new Set(custom.items.map((item) => (
          `${item.examType}|${item.region}|${item.unit}|${item.code || item.role}`.toLowerCase()
        )));
        const imported = [];
        let skipped = 0;

        for (const value of input.items) {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            skipped += 1;
            continue;
          }
          const unit = cleanText(value.unit, 120);
          const role = cleanText(value.role, 160);
          if (!unit || !role) {
            skipped += 1;
            continue;
          }
          const code = cleanText(value.code, 60);
          const key = `${examType}|${region}|${unit}|${code || role}`.toLowerCase();
          if (existingKeys.has(key)) {
            skipped += 1;
            continue;
          }
          existingKeys.add(key);
          const requirements = [
            cleanText(value.professional, 240) && `专业：${cleanText(value.professional, 240)}`,
            cleanText(value.education, 80) && `学历：${cleanText(value.education, 80)}`,
            cleanText(value.degree, 80) && `学位：${cleanText(value.degree, 80)}`,
            cleanText(value.political, 80) && `政治面貌：${cleanText(value.political, 80)}`,
            cleanText(value.freshGraduate, 80) && `应届要求：${cleanText(value.freshGraduate, 80)}`,
            cleanText(value.experience, 80) && `基层经历：${cleanText(value.experience, 80)}`,
            cleanText(value.notes, 240),
          ].filter(Boolean).join("；");
          imported.push({
            id: `imported-${randomUUID()}`,
            origin: "imported",
            examType,
            region,
            city: cleanText(value.city, 30) || region || "待确认",
            unit,
            role,
            code,
            fit: cleanText(value.fit, 500) || "由个人报考画像初筛，仍需回到官方职位表逐项核验。",
            requirements,
            status: cleanText(input.status, 80) || "职位表已导入",
            sourceLabel,
            sourceFile,
            matchScore: Number.isFinite(Number(value.matchScore)) ? Number(value.matchScore) : null,
            url,
            createdAt,
          });
        }

        if (!imported.length) {
          throw opportunityError("INVALID_EXAM_OPPORTUNITY_IMPORT", "没有新增岗位：职位可能已导入，或缺少单位和职位名称。");
        }
        await writeCustom([...imported, ...custom.items]);
        return { ...(await list()), importSummary: { imported: imported.length, skipped, sourceFile } };
      });
    },
    remove(id) {
      return mutate(async (custom) => {
        const safeId = cleanText(id, 100);
        const items = custom.items.filter((item) => item.id !== safeId);
        if (items.length === custom.items.length) {
          throw opportunityError("EXAM_OPPORTUNITY_NOT_FOUND", "这个自定义岗位不存在或不能删除。");
        }
        await writeCustom(items);
        return list();
      });
    },
  };
}
