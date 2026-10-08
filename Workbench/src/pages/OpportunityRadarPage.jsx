import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconBuildingBank,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconFileSpreadsheet,
  IconMapPin,
  IconPlus,
  IconTargetArrow,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import {
  createExamOpportunity,
  deleteExamOpportunity,
  importExamOpportunities,
  loadExamOpportunities,
} from "../lib/api";
import { parseOpportunityWorkbook } from "../lib/exam-opportunity-import";
import "./exam-dashboard.css";

const PAGE_SIZE = 12;
const ALL_PROVINCES = "全部省份";
const ALL_AREAS = "全部地区";
const GUANGDONG_CITIES = ["广州", "深圳", "珠海", "佛山", "惠州", "东莞", "中山", "江门", "肇庆"];

const emptyDraft = () => ({
  examType: "省考",
  region: "",
  city: "",
  unit: "",
  role: "",
  code: "",
  fit: "",
  requirements: "",
  status: "待确认",
  sourceLabel: "",
  url: "",
});

const emptyImportDraft = () => ({
  examType: "省考",
  region: "",
  sourceLabel: "官方职位表",
  sourceUrl: "",
  status: "职位表已导入",
});

const emptyProfile = () => ({
  majorKeywords: "",
  education: "",
  politicalStatus: "",
  graduationYear: "",
  targetRegions: "",
});

function savedProfile() {
  try {
    return { ...emptyProfile(), ...JSON.parse(window.localStorage.getItem("exam-candidate-profile") || "{}") };
  } catch {
    return emptyProfile();
  }
}

function opportunityProvince(item) {
  const location = `${item.region || ""} ${item.city || ""}`;
  if (location.includes("北京")) return "北京市";
  if (location.includes("广东") || GUANGDONG_CITIES.some((city) => location.includes(city))) return "广东省";
  return item.region || "其他地区";
}

function opportunityArea(item) {
  const province = opportunityProvince(item);
  const city = String(item.city || "").trim();
  if (province === "北京市") {
    const district = city.replace(/^北京市?/, "");
    return district && district !== "市" ? district : "全市";
  }
  if (province === "广东省") {
    const area = city.replace(/^广东省/, "");
    if (GUANGDONG_CITIES.includes(area)) return `${area}市`;
    return area || "全省";
  }
  return city || "全部地区";
}

function RadarSelect({ label, value, options, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`exam-radar-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`} ref={rootRef}>
      <span className="exam-radar-select__label">{label}</span>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="exam-radar-select__trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <IconMapPin aria-hidden="true" size={14} />
        <span>{value}</span>
        <IconChevronDown aria-hidden="true" size={14} />
      </button>
      {open ? (
        <div aria-label={label} className="exam-radar-select__menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option === value}
              className={option === value ? "is-selected" : ""}
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span>{option}</span>
              {option === value ? <IconCheck aria-hidden="true" size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OpportunityRadarPage() {
  const [result, setResult] = useState({ data: null, error: null });
  const [examType, setExamType] = useState("全部");
  const [province, setProvince] = useState(ALL_PROVINCES);
  const [area, setArea] = useState(ALL_AREAS);
  const [page, setPage] = useState(1);
  const [activeForm, setActiveForm] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [importDraft, setImportDraft] = useState(emptyImportDraft);
  const [candidateProfile, setCandidateProfile] = useState(savedProfile);
  const [importFile, setImportFile] = useState(null);
  const [onlyMatched, setOnlyMatched] = useState(true);
  const [importFeedback, setImportFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [expandedCards, setExpandedCards] = useState(() => new Set());
  const opportunitiesRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadExamOpportunities()
      .then((data) => {
        if (!cancelled) setResult({ data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setResult({ data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const opportunities = result.data?.items ?? [];
  const examTypes = useMemo(
    () => ["全部", ...new Set(opportunities.map((item) => item.examType).filter(Boolean))],
    [opportunities],
  );
  const provinces = useMemo(() => {
    const scoped = examType === "全部"
      ? opportunities
      : opportunities.filter((item) => item.examType === examType);
    return [ALL_PROVINCES, ...new Set(scoped.map(opportunityProvince).filter(Boolean))];
  }, [examType, opportunities]);
  const areas = useMemo(() => {
    if (province === ALL_PROVINCES) return [ALL_AREAS];
    const scoped = opportunities.filter((item) => (
      (examType === "全部" || item.examType === examType)
      && opportunityProvince(item) === province
    ));
    return [ALL_AREAS, ...new Set(scoped.map(opportunityArea).filter(Boolean))];
  }, [examType, opportunities, province]);
  const visibleOpportunities = useMemo(
    () => opportunities.filter((item) => (
      (examType === "全部" || item.examType === examType)
      && (province === ALL_PROVINCES || opportunityProvince(item) === province)
      && (area === ALL_AREAS || opportunityArea(item) === area)
    )),
    [area, examType, opportunities, province],
  );
  const pageCount = Math.max(1, Math.ceil(visibleOpportunities.length / PAGE_SIZE));
  const pageOpportunities = useMemo(
    () => visibleOpportunities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, visibleOpportunities],
  );
  const pageNumbers = useMemo(() => {
    const size = Math.min(5, pageCount);
    const start = Math.max(1, Math.min(page - 2, pageCount - size + 1));
    return Array.from({ length: size }, (_, index) => start + index);
  }, [page, pageCount]);
  const regionCount = new Set(opportunities.map((item) => item.city).filter(Boolean)).size;

  useEffect(() => {
    setPage(1);
  }, [area, examType, province]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function goToPage(nextPage) {
    setPage(Math.max(1, Math.min(pageCount, nextPage)));
    window.requestAnimationFrame(() => {
      opportunitiesRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function toggleCardDetails(id) {
    setExpandedCards((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addOpportunity(event) {
    event.preventDefault();
    setBusy(true);
    setMutationError("");
    try {
      const data = await createExamOpportunity(draft);
      setResult({ data, error: null });
      setDraft(emptyDraft());
      setActiveForm(null);
    } catch (error) {
      setMutationError(error.message || "岗位保存失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  function saveCandidateProfile() {
    window.localStorage.setItem("exam-candidate-profile", JSON.stringify(candidateProfile));
    setImportFeedback("报考画像已保存在当前浏览器。");
  }

  async function importWorkbook(event) {
    event.preventDefault();
    if (!importFile) {
      setMutationError("请先选择官方发布的 Excel 或 CSV 职位表。");
      return;
    }
    if (onlyMatched && !candidateProfile.majorKeywords.trim()) {
      setMutationError("启用画像初筛时，请先填写专业关键词。");
      return;
    }
    setBusy(true);
    setMutationError("");
    setImportFeedback("正在读取职位表并匹配岗位…");
    try {
      window.localStorage.setItem("exam-candidate-profile", JSON.stringify(candidateProfile));
      const parsed = await parseOpportunityWorkbook(importFile, candidateProfile, { onlyMatched });
      if (!parsed.rows.length) throw new Error("没有识别到可导入岗位，请检查表头或关闭画像初筛后重试。");
      const data = await importExamOpportunities({
        ...importDraft,
        sourceFile: parsed.fileName,
        items: parsed.rows,
      });
      setResult({ data, error: null });
      setImportFeedback(`已导入 ${data.importSummary.imported} 个岗位，跳过 ${data.importSummary.skipped} 个重复或无效岗位。`);
      setImportFile(null);
    } catch (error) {
      setMutationError(error.message || "职位表导入失败，请检查文件格式。");
      setImportFeedback("");
    } finally {
      setBusy(false);
    }
  }

  async function removeOpportunity(item) {
    if (!window.confirm(`确定删除自己添加的“${item.role}”吗？`)) return;
    setBusy(true);
    setMutationError("");
    try {
      const data = await deleteExamOpportunity(item.id);
      setResult({ data, error: null });
    } catch (error) {
      setMutationError(error.message || "岗位删除失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="exam-page exam-radar-page">
      <PageHeader
        eyebrow="APPLICATION · OPPORTUNITY RADAR"
        title="岗位雷达"
        description="集中查看国考、省考和其他招录机会，按考试类型与具体城市筛选，并回到官方公告核验。"
        aside={(
          <div className="exam-radar-page__aside">
            <button className="exam-button exam-button--quiet" onClick={() => setActiveForm("import")} type="button">
              <IconFileSpreadsheet size={17} /> 导入职位表
            </button>
            <button className="exam-button exam-button--primary" onClick={() => setActiveForm("add")} type="button">
              <IconPlus size={17} /> 添加岗位
            </button>
            <div className="exam-radar-page__mark" aria-hidden="true">
              <IconTargetArrow />
            </div>
          </div>
        )}
      />

      {activeForm === "add" ? (
        <section className="exam-composer exam-radar-composer" aria-label="添加岗位">
          <div className="exam-composer__head">
            <div>
              <span className="exam-kicker">ADD POSITION</span>
              <h2>添加一个岗位</h2>
              <p>可粘贴公考雷达分享链接或官方公告链接；保存后只写入你的本地私有文件。</p>
            </div>
            <button aria-label="关闭表单" onClick={() => setActiveForm(null)} type="button"><IconX /></button>
          </div>
          <form className="exam-form exam-form--opportunity" onSubmit={addOpportunity}>
            <label className="exam-field"><span>考试类型</span><select onChange={(event) => setDraft({ ...draft, examType: event.target.value })} value={draft.examType}><option>国考</option><option>省考</option><option>选调生</option><option>事业单位</option><option>其他招录</option></select></label>
            <label className="exam-field"><span>省份 / 区域</span><input maxLength="30" onChange={(event) => setDraft({ ...draft, region: event.target.value })} placeholder="例如：广东省" value={draft.region} /></label>
            <label className="exam-field"><span>具体地区</span><input maxLength="30" onChange={(event) => setDraft({ ...draft, city: event.target.value })} placeholder="例如：深圳市" required value={draft.city} /></label>
            <label className="exam-field"><span>当前状态</span><input maxLength="80" onChange={(event) => setDraft({ ...draft, status: event.target.value })} placeholder="报名中 / 待公告" value={draft.status} /></label>
            <label className="exam-field exam-field--wide"><span>招录单位</span><input autoFocus maxLength="120" onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="单位全称" required value={draft.unit} /></label>
            <label className="exam-field exam-field--wide"><span>岗位名称</span><input maxLength="160" onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="职位名称" required value={draft.role} /></label>
            <label className="exam-field"><span>职位代码</span><input maxLength="60" onChange={(event) => setDraft({ ...draft, code: event.target.value })} value={draft.code} /></label>
            <label className="exam-field"><span>来源名称</span><input maxLength="80" onChange={(event) => setDraft({ ...draft, sourceLabel: event.target.value })} placeholder="公考雷达 / 官方公告" value={draft.sourceLabel} /></label>
            <label className="exam-field exam-field--wide"><span>岗位链接</span><input maxLength="2000" onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://..." required type="url" value={draft.url} /></label>
            <label className="exam-field exam-field--wide"><span>匹配理由</span><input maxLength="500" onChange={(event) => setDraft({ ...draft, fit: event.target.value })} placeholder="例如：马克思主义理论专业可报" value={draft.fit} /></label>
            <label className="exam-field exam-field--wide"><span>关键要求</span><input maxLength="500" onChange={(event) => setDraft({ ...draft, requirements: event.target.value })} placeholder="学历、身份、应届要求等" value={draft.requirements} /></label>
            <button className="exam-button exam-button--primary" disabled={busy} type="submit">{busy ? "保存中…" : "保存岗位"}</button>
          </form>
        </section>
      ) : null}

      {activeForm === "import" ? (
        <section className="exam-composer exam-radar-composer" aria-label="导入官方职位表">
          <div className="exam-composer__head">
            <div>
              <span className="exam-kicker">OFFICIAL DATA IMPORT</span>
              <h2>导入官方职位表</h2>
              <p>支持 XLS、XLSX、CSV。文件只在本机解析；默认按报考画像筛选，结果仍需回到官方公告逐项核验。</p>
            </div>
            <button aria-label="关闭导入" onClick={() => setActiveForm(null)} type="button"><IconX /></button>
          </div>

          <div className="exam-import-profile">
            <div className="exam-import-profile__head">
              <div><strong>我的报考画像</strong><span>仅保存在当前浏览器，用于初筛，不会写入公开项目。</span></div>
              <button className="exam-text-button" onClick={saveCandidateProfile} type="button">保存画像</button>
            </div>
            <div className="exam-form exam-form--profile">
              <label className="exam-field exam-field--wide"><span>专业关键词（逗号分隔）</span><input onChange={(event) => setCandidateProfile({ ...candidateProfile, majorKeywords: event.target.value })} placeholder="例如：马克思主义理论，思想政治教育，A0305" value={candidateProfile.majorKeywords} /></label>
              <label className="exam-field"><span>学历</span><input onChange={(event) => setCandidateProfile({ ...candidateProfile, education: event.target.value })} placeholder="例如：硕士研究生" value={candidateProfile.education} /></label>
              <label className="exam-field"><span>政治面貌</span><input onChange={(event) => setCandidateProfile({ ...candidateProfile, politicalStatus: event.target.value })} placeholder="例如：中共党员" value={candidateProfile.politicalStatus} /></label>
              <label className="exam-field"><span>毕业年份</span><input inputMode="numeric" maxLength="4" onChange={(event) => setCandidateProfile({ ...candidateProfile, graduationYear: event.target.value })} placeholder="例如：2027" value={candidateProfile.graduationYear} /></label>
              <label className="exam-field exam-field--wide"><span>目标地区（逗号分隔）</span><input onChange={(event) => setCandidateProfile({ ...candidateProfile, targetRegions: event.target.value })} placeholder="例如：北京，深圳，广州，珠海" value={candidateProfile.targetRegions} /></label>
            </div>
          </div>

          <form className="exam-form exam-form--opportunity-import" onSubmit={importWorkbook}>
            <label className="exam-field exam-field--wide"><span>官方职位表文件</span><input accept=".xls,.xlsx,.csv" onChange={(event) => setImportFile(event.target.files?.[0] || null)} required type="file" /></label>
            <label className="exam-field"><span>考试类型</span><select onChange={(event) => setImportDraft({ ...importDraft, examType: event.target.value })} value={importDraft.examType}><option>国考</option><option>省考</option><option>选调生</option><option>事业单位</option><option>其他招录</option></select></label>
            <label className="exam-field"><span>省份 / 区域</span><input maxLength="30" onChange={(event) => setImportDraft({ ...importDraft, region: event.target.value })} placeholder="例如：广东省" required value={importDraft.region} /></label>
            <label className="exam-field"><span>来源名称</span><input maxLength="80" onChange={(event) => setImportDraft({ ...importDraft, sourceLabel: event.target.value })} required value={importDraft.sourceLabel} /></label>
            <label className="exam-field exam-field--wide"><span>官方公告或下载页 URL</span><input onChange={(event) => setImportDraft({ ...importDraft, sourceUrl: event.target.value })} placeholder="https://..." required type="url" value={importDraft.sourceUrl} /></label>
            <label className="exam-import-check"><input checked={onlyMatched} onChange={(event) => setOnlyMatched(event.target.checked)} type="checkbox" /><span>仅导入专业匹配岗位（推荐）</span></label>
            <button className="exam-button exam-button--primary" disabled={busy} type="submit"><IconFileSpreadsheet size={16} /> {busy ? "解析导入中…" : "解析并导入"}</button>
          </form>
          {importFeedback ? <p className="exam-import-feedback" role="status">{importFeedback}</p> : null}
        </section>
      ) : null}

      {mutationError ? <div className="exam-alert exam-alert--error" role="alert">{mutationError}</div> : null}

      {result.error ? (
        <div className="exam-alert exam-alert--error" role="alert">
          岗位数据加载失败：{result.error.message || "请稍后重试。"}
        </div>
      ) : !result.data ? (
        <div className="exam-skeleton-grid" aria-label="岗位数据加载中">
          <div className="exam-skeleton" />
          <div className="exam-skeleton" />
          <div className="exam-skeleton" />
        </div>
      ) : (
        <>
          <section className="exam-metrics exam-radar-metrics" aria-label="岗位概览">
            <div><span>岗位总数</span><strong>{opportunities.length}</strong><small>当前已整理机会</small></div>
            <div><span>筛选结果</span><strong>{visibleOpportunities.length}</strong><small>符合当前条件</small></div>
            <div><span>考试类型</span><strong>{Math.max(0, examTypes.length - 1)}</strong><small>国考、省考等类别</small></div>
            <div><span>具体地区</span><strong>{regionCount}</strong><small>按城市独立筛选</small></div>
          </section>

          <section className="exam-opportunities" aria-label="岗位列表" ref={opportunitiesRef}>
            <div className="exam-opportunities__head">
              <div>
                <span className="exam-kicker">MATCHED POSITIONS</span>
                <h2>当前岗位</h2>
                <p>{result.data.notice}</p>
              </div>
              <div className="exam-opportunities__filter-stack">
                <div className="exam-opportunities__filters" aria-label="按考试类型筛选">
                  {examTypes.map((item) => (
                    <button
                      className={examType === item ? "is-active" : ""}
                      key={item}
                      onClick={() => {
                        setExamType(item);
                        setProvince(ALL_PROVINCES);
                        setArea(ALL_AREAS);
                      }}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="exam-radar-selects" aria-label="按省份和地区筛选">
                  <RadarSelect
                    label="省份"
                    onChange={(value) => {
                      setProvince(value);
                      setArea(ALL_AREAS);
                    }}
                    options={provinces}
                    value={province}
                  />
                  <RadarSelect
                    disabled={province === ALL_PROVINCES}
                    label="地区"
                    onChange={setArea}
                    options={areas}
                    value={province === ALL_PROVINCES ? "请先选择省份" : area}
                  />
                </div>
              </div>
            </div>

            {visibleOpportunities.length > 0 ? (
              <div className="exam-opportunity-grid">
                {pageOpportunities.map((item) => {
                  const expanded = expandedCards.has(item.id);
                  const canExpand = (item.requirements || "").length > 150;
                  return (
                    <article className={`exam-opportunity${expanded ? " is-expanded" : ""}`} key={item.id}>
                      <header className="exam-opportunity__header">
                        <div className="exam-opportunity__meta">
                          <span><IconMapPin size={13} /><strong>{item.examType}</strong><b>·</b>{item.city}</span>
                          {item.origin === "manual" ? <i>我添加的</i> : null}
                          {item.origin === "imported" ? <i>职位表导入</i> : null}
                        </div>
                        <span className="exam-opportunity__status">{item.status}</span>
                      </header>
                      <div className="exam-opportunity__body">
                        <span className="exam-opportunity__unit"><IconBuildingBank size={14} /> {item.unit}</span>
                        <h3>{item.role}</h3>
                        {item.code ? <code>职位代码&nbsp; {item.code}</code> : null}
                        <p className="exam-opportunity__fit">{item.fit}</p>
                        {item.requirements ? (
                          <div className="exam-opportunity__requirements">
                            <span>报考条件</span>
                            <p className={expanded ? "is-expanded" : ""}>{item.requirements}</p>
                            {canExpand ? (
                              <button aria-expanded={expanded} onClick={() => toggleCardDetails(item.id)} type="button">
                                {expanded ? "收起条件" : "查看完整条件"}
                                <IconChevronDown aria-hidden="true" size={13} />
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <footer className="exam-opportunity__actions">
                        <a href={item.url} rel="noreferrer" target="_blank" title={item.sourceLabel}>
                          <span>{item.sourceLabel}</span><IconExternalLink size={14} />
                        </a>
                        {item.origin === "manual" || item.origin === "imported" ? (
                          <button aria-label={`删除 ${item.role}`} disabled={busy} onClick={() => removeOpportunity(item)} title="删除岗位" type="button">
                            <IconTrash size={15} />
                          </button>
                        ) : null}
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="exam-radar-empty">当前筛选下没有岗位，请切换考试类型或地区。</div>
            )}
            {visibleOpportunities.length > PAGE_SIZE ? (
              <nav aria-label="岗位分页" className="exam-pagination">
                <span className="exam-pagination__summary">
                  第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleOpportunities.length)} 条，共 {visibleOpportunities.length} 条
                </span>
                <div className="exam-pagination__controls">
                  <button aria-label="上一页" disabled={page === 1} onClick={() => goToPage(page - 1)} type="button"><IconChevronLeft size={15} /></button>
                  {pageNumbers.map((number) => (
                    <button
                      aria-current={page === number ? "page" : undefined}
                      className={page === number ? "is-active" : ""}
                      key={number}
                      onClick={() => goToPage(number)}
                      type="button"
                    >
                      {number}
                    </button>
                  ))}
                  <button aria-label="下一页" disabled={page === pageCount} onClick={() => goToPage(page + 1)} type="button"><IconChevronRight size={15} /></button>
                </div>
                <span className="exam-pagination__page">{page} / {pageCount} 页</span>
              </nav>
            ) : null}
            {result.data.updatedAt ? (
              <p className="exam-opportunities__updated">岗位信息整理于 {result.data.updatedAt}</p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
