import assert from "node:assert/strict";
import test from "node:test";

import {
  rowsFromWorkbookMatrix,
  scoreImportedOpportunity,
} from "../src/lib/exam-opportunity-import.js";

const profile = {
  majorKeywords: "马克思主义理论，思想政治教育，A0305",
  education: "硕士研究生",
  politicalStatus: "中共党员",
  graduationYear: "2027",
  targetRegions: "北京，深圳，广州",
};

test("official workbook rows are recognized and filtered by candidate profile", () => {
  const matrix = [
    ["2027 年考试录用公务员职位表"],
    ["招录机关", "用人司局", "招考职位", "职位代码", "工作地点", "专业", "学历", "政治面貌", "是否限应届毕业生报考"],
    ["示例机关", "机关党委", "综合管理岗", "A001", "深圳市", "马克思主义理论", "研究生", "中共党员", "是"],
    ["示例机关", "业务处", "技术岗位", "A002", "深圳市", "计算机科学与技术", "研究生", "不限", "是"],
  ];

  const rows = rowsFromWorkbookMatrix(matrix, profile, { onlyMatched: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unit, "示例机关 · 机关党委");
  assert.equal(rows[0].role, "综合管理岗");
  assert.ok(rows[0].matchScore >= 90);
  assert.match(rows[0].fit, /专业包含/);
});

test("unrestricted majors remain eligible", () => {
  const result = scoreImportedOpportunity({
    professional: "专业不限",
    education: "本科及以上",
    political: "不限",
    city: "北京市",
  }, profile);
  assert.equal(result.matched, true);
  assert.match(result.fit, /专业不限/);
});

test("discipline code matching does not confuse 0305 with A030305", () => {
  const marxism = scoreImportedOpportunity({ professional: "马克思主义理论类（A0305）" }, profile);
  const marxismChild = scoreImportedOpportunity({ professional: "马克思主义基本原理（A030501）" }, profile);
  const socialWork = scoreImportedOpportunity({ professional: "社会工作（A030305）" }, profile);

  assert.equal(marxism.matched, true);
  assert.equal(marxismChild.matched, true);
  assert.equal(socialWork.matched, false);
});
