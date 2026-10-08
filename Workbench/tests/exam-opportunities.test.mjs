import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CUSTOM_EXAM_OPPORTUNITIES_PATH,
  EXAM_OPPORTUNITIES_PATH,
  createExamOpportunitiesRepository,
} from "../server/exam-opportunities.mjs";

test("exam opportunities reads valid local records and rejects unsafe URLs", async (context) => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "exam-opportunities-"));
  context.after(() => rm(vaultRoot, { recursive: true, force: true }));
  const filePath = path.join(vaultRoot, EXAM_OPPORTUNITIES_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({
    updatedAt: "2026-10-08",
    notice: "测试数据",
    items: [
      { examType: "国考", unit: "示例单位", role: "综合管理岗", url: "https://example.gov.cn/jobs" },
      { unit: "不安全链接", role: "无效岗位", url: "javascript:alert(1)" },
    ],
  }));

  const result = await createExamOpportunitiesRepository({ vaultRoot }).list();
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].unit, "示例单位");
  assert.equal(result.items[0].examType, "国考");
  assert.equal(result.items[0].url, "https://example.gov.cn/jobs");
});

test("exam opportunities returns an empty list when no local file exists", async (context) => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "exam-opportunities-empty-"));
  context.after(() => rm(vaultRoot, { recursive: true, force: true }));
  const result = await createExamOpportunitiesRepository({ vaultRoot }).list();
  assert.deepEqual(result.items, []);
});

test("exam opportunities adds and removes private custom records", async (context) => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "exam-opportunities-custom-"));
  context.after(() => rm(vaultRoot, { recursive: true, force: true }));
  const repository = createExamOpportunitiesRepository({
    vaultRoot,
    now: () => new Date("2026-10-08T08:00:00.000Z"),
  });

  const added = await repository.add({
    examType: "省考",
    region: "广东省",
    city: "深圳市",
    unit: "示例单位",
    role: "综合管理岗",
    url: "https://www.gongkaoleida.com/example",
  });

  assert.equal(added.customCount, 1);
  assert.equal(added.items[0].origin, "manual");
  assert.equal(added.items[0].sourceLabel, "公考雷达");
  assert.equal(added.items[0].city, "深圳市");
  const stored = JSON.parse(await readFile(path.join(vaultRoot, CUSTOM_EXAM_OPPORTUNITIES_PATH), "utf8"));
  assert.equal(stored.items.length, 1);

  const removed = await repository.remove(added.items[0].id);
  assert.equal(removed.customCount, 0);
  assert.deepEqual(removed.items, []);
});

test("exam opportunities validates required fields and safe URLs", async (context) => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "exam-opportunities-validation-"));
  context.after(() => rm(vaultRoot, { recursive: true, force: true }));
  const repository = createExamOpportunitiesRepository({ vaultRoot });

  await assert.rejects(
    repository.add({ city: "深圳市", unit: "示例单位", role: "岗位", url: "javascript:alert(1)" }),
    { code: "INVALID_EXAM_OPPORTUNITY" },
  );
  await assert.rejects(
    repository.add({ city: "", unit: "示例单位", role: "岗位", url: "https://example.gov.cn" }),
    { code: "INVALID_EXAM_OPPORTUNITY" },
  );
});

test("exam opportunities imports normalized official rows and skips duplicates", async (context) => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "exam-opportunities-import-"));
  context.after(() => rm(vaultRoot, { recursive: true, force: true }));
  const repository = createExamOpportunitiesRepository({ vaultRoot });
  const payload = {
    examType: "省考",
    region: "广东省",
    sourceLabel: "广东省考官方职位表",
    sourceUrl: "https://example.gov.cn/official.xlsx",
    sourceFile: "广东省职位表.xlsx",
    items: [
      {
        unit: "示例机关",
        role: "综合管理岗",
        code: "A001",
        city: "深圳市",
        professional: "马克思主义理论",
        education: "研究生",
        political: "中共党员",
        fit: "专业包含“马克思主义理论”",
        matchScore: 90,
      },
    ],
  };

  const first = await repository.importBatch(payload);
  assert.equal(first.importSummary.imported, 1);
  assert.equal(first.items[0].origin, "imported");
  assert.equal(first.items[0].sourceFile, "广东省职位表.xlsx");
  assert.match(first.items[0].requirements, /专业：马克思主义理论/);

  const sameCodeAtAnotherUnit = await repository.importBatch({
    ...payload,
    items: [{ ...payload.items[0], unit: "另一示例机关" }],
  });
  assert.equal(sameCodeAtAnotherUnit.importSummary.imported, 1);

  await assert.rejects(repository.importBatch(payload), { code: "INVALID_EXAM_OPPORTUNITY_IMPORT" });
});
