import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyExamCurrentAffairs,
  createExamCurrentAffairsService,
} from "../server/exam-current-affairs.mjs";

const sources = [
  { id: "news", label: "官方要闻", category: "时政要闻", url: "https://example.test/news" },
  { id: "policy", label: "官方政策", category: "政策文件", url: "https://example.test/policy" },
];

test("classifies official policy and exam-relevant themes", () => {
  const result = classifyExamCurrentAffairs([
    {
      source: sources[0],
      payload: [{
        TITLE: "推进基层治理和公共服务改革",
        URL: "https://www.gov.cn/example-news.htm",
        DOCRELPUBTIME: "2026-10-08",
      }],
    },
    {
      source: sources[1],
      payload: [{
        TITLE: "国务院办公厅印发促进就业的意见",
        URL: "https://www.gov.cn/example-policy.htm",
        DOCRELPUBTIME: "2026-10-07",
      }],
    },
  ]);

  assert.equal(result.total, 2);
  assert.equal(result.mustRead.length, 1);
  assert.equal(result.browse.length, 1);
  assert.equal(result.mustRead[0].evidence.level, "official");
  assert.match(result.mustRead[0].attention.reason, /申论|政策/);
});

test("loads, caches and exposes stale official current-affairs data", async () => {
  let currentTime = Date.parse("2026-10-08T02:00:00.000Z");
  let fail = false;
  let calls = 0;
  const service = createExamCurrentAffairsService({
    sources,
    now: () => currentTime,
    cacheTtlMs: 1_000,
    fetchImpl: async (url) => {
      calls += 1;
      if (fail) throw new Error("offline");
      return new Response(JSON.stringify([{
        TITLE: url.endsWith("policy") ? "国务院发布新的改革意见" : "推进基层治理现代化",
        URL: "https://www.gov.cn/example.htm",
        DOCRELPUBTIME: "2026-10-08",
      }]), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const first = await service.load();
  const cached = await service.load();
  assert.equal(first.status, "live");
  assert.equal(cached.fetchedAt, first.fetchedAt);
  assert.equal(calls, 2);

  currentTime += 2_000;
  fail = true;
  const stale = await service.load();
  assert.equal(stale.status, "stale");
  assert.match(stale.error.message, /offline/);
});
