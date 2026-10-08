import { useCallback, useEffect, useState } from "react";
import {
  IconArrowUpRight,
  IconClock,
  IconExternalLink,
  IconEye,
  IconRefresh,
  IconShieldCheck,
  IconStack2,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import { loadDailyHot } from "../lib/api";
import { formatCompactDate, formatFullDate } from "../lib/format";
import "../components/daily-hot/daily-hot.css";

function ExternalNewsLink({ children, className = "", href, label }) {
  if (!href) return null;
  return (
    <a
      aria-label={label}
      className={className}
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function ItemMeta({ item }) {
  return (
    <div className="daily-hot-card__meta">
      <span>{item.evidence?.label || "来源待核对"}</span>
      {item.categoryLabel ? <span>{item.categoryLabel}</span> : null}
      <span>{formatCompactDate(item.latestAt || item.discoveredAt || item.publishedAt)}</span>
    </div>
  );
}

function HotCard({ item, index, featured = false }) {
  const primaryLink = item.links?.original;
  const domain = item.attention?.domains?.[0]?.label;

  return (
    <article
      className={`daily-hot-card${featured ? " daily-hot-card--featured" : ""}`}
    >
      <div className="daily-hot-card__index" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="daily-hot-card__body">
        <div className="daily-hot-card__eyebrow">
          <span>{item.kind === "policy" ? "OFFICIAL POLICY" : "CURRENT AFFAIRS"}</span>
          {domain ? <span className="daily-hot-card__domain">{domain}</span> : null}
        </div>
        <h3>{item.title}</h3>
        <p className="daily-hot-card__reason">{item.attention?.reason}</p>
        {item.summary ? (
          <div className="daily-hot-card__summary">
            <span>官方摘要</span>
            <p>{item.summary}</p>
          </div>
        ) : null}
        <p className="daily-hot-card__latest">
          <strong>备考切入</strong>
          {item.examAngle}
        </p>
        <ItemMeta item={item} />
        <div className="daily-hot-card__actions">
          <ExternalNewsLink
            className="daily-hot-link daily-hot-link--primary"
            href={primaryLink}
            label={`查看官方原文：${item.title}`}
          >
            官方原文 <IconExternalLink aria-hidden="true" />
          </ExternalNewsLink>
        </div>
      </div>
    </article>
  );
}

function CompactHotRow({ item }) {
  const primaryLink = item.links?.original;
  return (
    <article className="daily-hot-row">
      <div>
        <span className="daily-hot-row__kind">
          {item.categoryLabel} · {item.themeLabel}
        </span>
        <h3>{item.title}</h3>
        <p>{item.attention?.reason}</p>
      </div>
      <div className="daily-hot-row__aside">
        <time>{formatCompactDate(item.latestAt || item.discoveredAt || item.publishedAt)}</time>
        <ExternalNewsLink
          className="daily-hot-row__open"
          href={primaryLink}
          label={`打开：${item.title}`}
        >
          阅读 <IconArrowUpRight aria-hidden="true" />
        </ExternalNewsLink>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="daily-hot-loading" aria-label="正在读取官方时政数据">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

function formatRefreshTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function DailyHotPage() {
  const [result, setResult] = useState({ data: null, source: "loading", error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshOutcome, setRefreshOutcome] = useState("");

  const refresh = useCallback(async (force = false) => {
    setRefreshing(true);
    if (force) setRefreshOutcome("正在绕过缓存，请求中国政府网官方数据…");
    try {
      const next = await loadDailyHot({ refresh: force });
      setResult(next);
      if (force) {
        if (next.source === "live" && next.data?.status === "live") {
          setRefreshOutcome(`刷新成功 · ${formatRefreshTime(next.data.fetchedAt)}`);
        } else if (next.data?.status === "stale") {
          setRefreshOutcome("刷新失败，已继续显示上一版有效数据");
        } else {
          setRefreshOutcome("刷新失败，请检查网络后重试");
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const loading = result.source === "loading";
  const live = result.source === "live";
  const data = result.data;
  const unavailable = !loading && !live;
  const stale = data?.status === "stale";
  const mustRead = data?.tiers?.mustRead || [];
  const browse = data?.tiers?.browse || [];
  const other = data?.tiers?.other || [];

  const sourceAside = (
    <div className="daily-hot-source">
      <div>
        <span className={`status-dot${stale ? " status-dot--warn" : " status-dot--ok"}`} />
        <strong>{stale ? "上一版有效数据" : live ? "官方数据已连接" : "连接中"}</strong>
      </div>
      <span>
        {data?.fetchedAt
          ? `${formatFullDate(data.fetchedAt)}:${new Date(data.fetchedAt).getSeconds().toString().padStart(2, "0")}`
          : "等待首次刷新"}
      </span>
    </div>
  );

  return (
    <div className="page page--daily-hot">
      <PageHeader
        eyebrow="CIVIL SERVICE · OFFICIAL CURRENT AFFAIRS"
        title="考公时政热点"
        aside={sourceAside}
      />

      <section className="daily-hot-summary" aria-label="热点概览">
        <div>
          <strong>{loading ? "…" : data?.counts?.upstream ?? "—"}</strong>
          <span>官方候选</span>
        </div>
        <div>
          <strong>{loading ? "…" : mustRead.length}</strong>
          <span>今日重点</span>
        </div>
        <div>
          <strong>{loading ? "…" : browse.length}</strong>
          <span>值得积累</span>
        </div>
      </section>

      <div className="daily-hot-toolbar">
        <div className="daily-hot-daily">
          <IconClock aria-hidden="true" />
          <span>
            中国政府网要闻与最新政策 · 30 分钟本地缓存 · 以官方原文为准
          </span>
          <ExternalNewsLink
            className="daily-hot-inline-link"
            href={data?.source?.url}
            label="打开中国政府网"
          >
            官方首页 <IconArrowUpRight aria-hidden="true" />
          </ExternalNewsLink>
        </div>
        <div className="daily-hot-refresh-control">
          <span aria-live="polite" className="daily-hot-refresh-note">
            {refreshOutcome}
          </span>
          <button
            className="daily-hot-refresh"
            disabled={refreshing}
            onClick={() => void refresh(true)}
            type="button"
          >
            <IconRefresh aria-hidden="true" />
            {refreshing ? "正在刷新…" : "强制刷新"}
          </button>
        </div>
      </div>

      {stale ? (
        <div className="daily-hot-warning" role="status">
          当前刷新失败，正在展示 {formatFullDate(data?.fetchedAt)} 的上一版有效结果。{data?.error?.message}
        </div>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : unavailable ? (
        <div className="error-note daily-hot-unavailable">
          <strong>官方时政数据暂时无法读取</strong>
          <p>{result.error?.message || data?.error?.message || "本地数据服务或外部来源不可用。"}</p>
          <button onClick={() => void refresh(true)} type="button">重新连接</button>
        </div>
      ) : (
        <>
          <section className="daily-hot-section" aria-labelledby="must-read-title">
            <header className="daily-hot-section__head">
              <div>
                <span className="daily-hot-section__icon"><IconEye aria-hidden="true" /></span>
                <div>
                  <span className="eyebrow">MUST READ</span>
                  <h2 id="must-read-title">今日重点</h2>
                </div>
              </div>
            </header>

            {mustRead.length > 0 ? (
              <div className="daily-hot-featured-grid">
                {mustRead.map((item, index) => (
                  <HotCard featured index={index} item={item} key={item.id} />
                ))}
              </div>
            ) : (
              <div className="daily-hot-calm">
                <IconShieldCheck aria-hidden="true" />
                <div>
                  <strong>今天没有必看热点</strong>
                  <span>仍可查看值得积累和其余官方动态。</span>
                </div>
              </div>
            )}
          </section>

          <section className="daily-hot-section" aria-labelledby="browse-title">
            <header className="daily-hot-section__head">
              <div>
                <span className="daily-hot-section__icon"><IconStack2 aria-hidden="true" /></span>
                <div>
                  <span className="eyebrow">WORTH BROWSING</span>
                  <h2 id="browse-title">值得积累</h2>
                </div>
              </div>
            </header>
            <div className="daily-hot-browse-list">
              {browse.length > 0 ? (
                browse.map((item) => <CompactHotRow item={item} key={item.id} />)
              ) : (
                <div className="collection-empty">当前没有更多值得积累的动态。</div>
              )}
            </div>
          </section>

          {other.length > 0 ? (
            <details className="daily-hot-other">
              <summary>
                <span>其余动态</span>
                <span>{other.length} 条低优先级候选</span>
              </summary>
              <div className="daily-hot-other__list">
                {other.map((item) => <CompactHotRow item={item} key={item.id} />)}
              </div>
            </details>
          ) : null}

          <footer className="daily-hot-footnote">
            <span>数据来源：中国政府网·要闻、中国政府网·最新政策</span>
            <span>“备考价值”和“备考切入”为本地规则生成；事实、数字、政策表述与原话请回官方原文核对。</span>
          </footer>
        </>
      )}
    </div>
  );
}
