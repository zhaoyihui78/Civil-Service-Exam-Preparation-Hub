const HEADER_ALIASES = {
  unit: ["部门名称", "招录机关", "招考单位", "单位名称", "用人单位", "招录单位"],
  subunit: ["用人司局", "内设机构", "招录部门", "用人部门"],
  role: ["招考职位", "职位名称", "岗位名称", "招录职位", "职位", "岗位"],
  code: ["职位代码", "岗位代码", "招考职位代码"],
  city: ["工作地点", "职位工作地点", "工作地区", "考区", "地区", "所在地区"],
  professional: ["专业", "专业要求", "所需专业", "研究生专业名称及代码", "本科专业名称及代码"],
  education: ["学历", "学历要求"],
  degree: ["学位", "学位要求"],
  political: ["政治面貌", "政治面貌要求"],
  freshGraduate: ["是否限应届毕业生报考", "应届生要求", "应届毕业生", "是否应届"],
  experience: ["基层工作经历最低年限", "基层工作最低年限", "是否要求2年以上基层工作经历", "基层工作经历要求"],
  notes: ["备注", "其他要求", "其它要求", "资格条件", "职位要求"],
  description: ["职位简介", "岗位简介", "职位描述", "主要职责"],
  hires: ["招考人数", "招录人数", "录用人数", "计划人数"],
};

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return text(value).replace(/\s+/g, "").replace(/[：:（）()【】\[\]]/g, "").toLowerCase();
}

function fieldForHeader(header) {
  const candidate = normalized(header);
  if (!candidate) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => {
      const expected = normalized(alias);
      return candidate === expected || (expected.length >= 3 && candidate.includes(expected));
    })) return field;
  }
  return null;
}

function headerMap(row) {
  const result = new Map();
  row.forEach((value, index) => {
    const field = fieldForHeader(value);
    if (field && !result.has(field)) result.set(field, index);
  });
  return result;
}

function splitKeywords(value) {
  return text(value).split(/[，,、;；\n]+/).map((item) => item.trim()).filter(Boolean);
}

function professionalMatchesKeyword(professional, keyword) {
  const candidate = text(professional);
  const expected = text(keyword);
  if (!candidate || !expected) return false;
  if (!/^A?\d{4,}$/i.test(expected)) return candidate.includes(expected);

  const digits = expected.replace(/^A/i, "");
  // Discipline codes may appear as A0305 or as a six-digit child code such as
  // A030501. Requiring a token boundary prevents 0305 from matching A030305.
  const code = new RegExp(`(?:^|[^0-9])A?${digits}(?:[^0-9]|$|\\d{2}(?:[^0-9]|$))`, "i");
  return code.test(candidate);
}

export function scoreImportedOpportunity(row, profile = {}) {
  const professional = text(row.professional);
  const requirements = `${professional} ${text(row.education)} ${text(row.degree)} ${text(row.political)} ${text(row.freshGraduate)} ${text(row.experience)} ${text(row.notes)}`;
  const majorKeywords = splitKeywords(profile.majorKeywords);
  const targetRegions = splitKeywords(profile.targetRegions);
  const unrestricted = /不限专业|专业不限|各类专业|不限制专业/.test(professional);
  const matchedKeyword = majorKeywords.find((keyword) => professionalMatchesKeyword(professional, keyword));
  const majorMatched = majorKeywords.length === 0 || unrestricted || Boolean(matchedKeyword);
  let score = majorMatched ? 48 : 8;
  const reasons = [];

  if (unrestricted) reasons.push("专业不限");
  else if (matchedKeyword) reasons.push(`专业包含“${matchedKeyword}”`);
  else if (majorKeywords.length) reasons.push("专业未命中画像关键词");
  const educationRule = `${row.education} ${row.degree}`;
  const educationMatched = !educationRule.trim()
    || /不限|本科及以上|本科以上/.test(educationRule)
    || (/硕士|研究生/.test(educationRule) && /硕士|研究生/.test(profile.education || ""));
  if (educationMatched) {
    score += 14;
    reasons.push("学历条件可进一步核验");
  }
  if (/中共党员|党员/.test(row.political || requirements) && /党员/.test(profile.politicalStatus || "")) {
    score += 12;
    reasons.push("党员条件匹配");
  }
  if (/应届/.test(`${row.freshGraduate} ${row.experience}`) && text(profile.graduationYear)) {
    score += 10;
    reasons.push("包含应届要求");
  }
  const target = targetRegions.find((region) => `${row.city}`.includes(region));
  if (target) {
    score += 16;
    reasons.push(`目标地区：${target}`);
  }

  return {
    matched: majorMatched,
    score: Math.min(100, score),
    fit: reasons.length ? reasons.join("；") : "已从官方职位表导入，资格条件待逐项核验。",
  };
}

export function rowsFromWorkbookMatrix(matrix, profile = {}, { onlyMatched = true } = {}) {
  if (!Array.isArray(matrix)) return [];
  let headerIndex = -1;
  let fields = new Map();
  for (let index = 0; index < Math.min(matrix.length, 25); index += 1) {
    const candidate = headerMap(Array.isArray(matrix[index]) ? matrix[index] : []);
    if (candidate.has("role") && (candidate.has("unit") || candidate.has("subunit")) && candidate.size > fields.size) {
      headerIndex = index;
      fields = candidate;
    }
  }
  if (headerIndex < 0) return [];

  let previousUnit = "";
  const results = [];
  for (const source of matrix.slice(headerIndex + 1)) {
    if (!Array.isArray(source)) continue;
    const value = (field) => text(source[fields.get(field)]);
    const directUnit = fields.has("unit") ? value("unit") : "";
    if (directUnit) previousUnit = directUnit;
    const subunit = fields.has("subunit") ? value("subunit") : "";
    const role = fields.has("role") ? value("role") : "";
    const primaryUnit = directUnit || previousUnit;
    const genericSubunit = /^(内设部门|内设机构|机关处室)$/.test(subunit);
    const unit = primaryUnit && subunit && !genericSubunit && subunit !== primaryUnit
      ? `${primaryUnit} · ${subunit}`
      : primaryUnit || subunit;
    if (!unit || !role || /合计|小计|说明/.test(role)) continue;
    const row = {
      unit,
      role,
      code: fields.has("code") ? value("code") : "",
      city: fields.has("city") ? value("city") : "",
      professional: fields.has("professional") ? value("professional") : "",
      education: fields.has("education") ? value("education") : "",
      degree: fields.has("degree") ? value("degree") : "",
      political: fields.has("political") ? value("political") : "",
      freshGraduate: fields.has("freshGraduate") ? value("freshGraduate") : "",
      experience: fields.has("experience") ? value("experience") : "",
      notes: fields.has("notes") ? value("notes") : "",
      description: fields.has("description") ? value("description") : "",
      hires: fields.has("hires") ? value("hires") : "",
    };
    const match = scoreImportedOpportunity(row, profile);
    if (!onlyMatched || match.matched) results.push({ ...row, fit: match.fit, matchScore: match.score });
  }
  return results;
}

export async function parseOpportunityWorkbook(file, profile = {}, options = {}) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    rows.push(...rowsFromWorkbookMatrix(matrix, profile, options));
  }
  const deduplicated = new Map();
  rows.forEach((row) => {
    const key = `${row.code || ""}|${row.unit}|${row.role}`.toLowerCase();
    if (!deduplicated.has(key)) deduplicated.set(key, row);
  });
  return {
    rows: [...deduplicated.values()],
    sheetCount: workbook.SheetNames.length,
    fileName: file.name,
  };
}
