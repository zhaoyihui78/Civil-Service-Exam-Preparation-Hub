import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useNavigate, useParams } from "react-router-dom";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBook2,
  IconBookmark,
  IconBooks,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFileText,
  IconFileTypePdf,
  IconFolderOpen,
  IconLanguage,
  IconMaximize,
  IconMinus,
  IconPhoto,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { PageHeader } from "../components/PageHeader";
import { HOSTED_ACCESS_REQUIRED, loadBooks, loadHostedBookPdf, openLocalTarget } from "../lib/api";
import {
  BOOK_READING_PROGRESS_EVENT,
  BOOK_READING_PROGRESS_KEY,
  bookReadingStorage,
  formatBookChapterProgress,
  loadBookReadingProgress,
  resolveBookResume,
  resolveLatestBookResume,
} from "../lib/book-reading-progress";

function loadingResult() {
  return { data: null, source: "loading", error: null };
}

function coverUrl(book) {
  if (HOSTED_ACCESS_REQUIRED) return null;
  return book.coverDocumentId
    ? `/api/vault-images/${encodeURIComponent(book.coverDocumentId)}`
    : null;
}

function BookCover({ book, compact = false, current = false }) {
  const source = coverUrl(book);
  return (
    <span className={`book-cover${compact ? " book-cover--compact" : ""}${current ? " book-cover--current" : ""}`}>
      {source ? (
        <img alt={`《${book.title}》封面`} src={source} />
      ) : (
        <span className="book-cover__fallback" aria-hidden="true">
          <IconBook2 size={compact ? 34 : 44} stroke={1.4} />
          <small>{book.title}</small>
        </span>
      )}
    </span>
  );
}

function readerContext(book, language, chapter, initialPosition = null) {
  return {
    kind: "book",
    bookId: book.id,
    bookTitle: book.title,
    language,
    chapterId: chapter.id,
    chapters: (book.chapters[language] || []).map((item) => ({
      id: item.id,
      title: item.title,
      order: item.order,
    })),
    initialPosition,
  };
}

function Shelf({ data, onOpenBook, onOpenDocument, progressByBook }) {
  const books = data?.books ?? [];
  const currentReading = resolveLatestBookResume(books, progressByBook);

  const continueReading = () => {
    if (!currentReading) return;
    const { book, resume } = currentReading;
    onOpenDocument({
      id: resume.chapter.id,
      readerContext: readerContext(book, resume.language, resume.chapter, resume),
    });
  };

  return (
    <div className="page page--books">
      <PageHeader
        eyebrow="CIVIL SERVICE COURSES · READING"
        title="考公课程与书架"
        description="围绕岗位选择、行测、申论和马克思主义理论组织的分章课程，可记录阅读位置并继续学习。"
        aside={
          <div className="books-total mono">
            <span>{data?.total ?? 0}</span>
            <small>BOOKS</small>
          </div>
        }
      />

      {currentReading ? (
        <motion.button
          animate={{ opacity: 1, y: 0 }}
          aria-label={`继续阅读《${currentReading.book.title}》${currentReading.resume.chapter.title}，${formatBookChapterProgress(currentReading.resume.progress)}`}
          className="book-current"
          initial={{ opacity: 0, y: 8 }}
          onClick={continueReading}
          transition={{ duration: 0.24 }}
          type="button"
        >
          <BookCover book={currentReading.book} current />
          <span className="book-current__body">
            <span className="eyebrow">CURRENTLY READING</span>
            <strong>{currentReading.book.title}</strong>
            <span className="book-current__chapter">
              上次读到 {currentReading.resume.chapter.title}
            </span>
            <span className="book-current__meta">
              <span>
                {currentReading.book.languages.find(
                  (item) => item.key === currentReading.resume.language,
                )?.label || currentReading.resume.language}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatBookChapterProgress(currentReading.resume.progress)}</span>
            </span>
            <span
              aria-label={`${currentReading.resume.chapter.title}阅读位置`}
              aria-valuemax="100"
              aria-valuemin="0"
              aria-valuenow={Math.round(currentReading.resume.progress * 100)}
              className="book-current__progress"
              role="progressbar"
            >
              <span style={{ width: `${Math.round(currentReading.resume.progress * 100)}%` }} />
            </span>
          </span>
          <span className="book-current__action">
            回到上次位置 <IconArrowRight size={17} />
          </span>
        </motion.button>
      ) : null}

      {books.length > 0 ? (
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="bookshelf"
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.28 }}
        >
          <div className="bookshelf__grid">
            {books.map((book, index) => {
              const resume = resolveBookResume(book, progressByBook.get(book.id));
              return (
                <motion.button
                  animate={{ opacity: 1, y: 0 }}
                  aria-label={`打开《${book.title}》`}
                  className="book-card"
                  initial={{ opacity: 0, y: 12 }}
                  key={book.id}
                  onClick={() => onOpenBook(book)}
                  transition={{ delay: index * 0.04, duration: 0.28 }}
                  type="button"
                >
                  <BookCover book={book} />
                  <span className="book-card__body">
                    <span className="eyebrow">EXAM COURSE</span>
                    <strong>{book.title}</strong>
                    <span className="book-card__author">{book.author || "作者未记录"}</span>
                    <span className="book-card__stats">
                      <span><IconFileText size={14} /> {book.chapterCount} 章</span>
                      <span><IconLanguage size={14} /> {book.languages.length} 个版本</span>
                      <span><IconPhoto size={14} /> {book.imageCount} 张原图</span>
                    </span>
                    {resume ? (
                      <span className="book-card__resume">
                        <IconBookmark size={14} />
                        <span>上次读到 {resume.chapter.title} · {formatBookChapterProgress(resume.progress)}</span>
                      </span>
                    ) : null}
                    <span className="book-card__enter">
                      {resume ? "继续阅读" : "查看章节"} <IconChevronRight size={16} />
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.section>
      ) : (
        <div className="books-empty">
          <IconBooks size={28} stroke={1.5} />
          <strong>考公书架还是空的</strong>
          <span>放入 `10_raw/books/书名/中文阅读版/` 的章节会自动出现在这里。</span>
        </div>
      )}
    </div>
  );
}

function groupChapters(chapters) {
  const groups = [];
  for (const chapter of chapters) {
    let group = groups.find((item) => item.key === chapter.group);
    if (!group) {
      group = { key: chapter.group, label: chapter.groupLabel, chapters: [] };
      groups.push(group);
    }
    group.chapters.push(chapter);
  }
  return groups;
}

function PdfReaderModal({ book, onClose }) {
  const shellRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(100);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  const [stageWidth, setStageWidth] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(
    HOSTED_ACCESS_REQUIRED ? null : `/api/book-pdfs/${encodeURIComponent(book.original.id)}`,
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !document.fullscreenElement) onClose();
    };
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [onClose]);

  useEffect(() => {
    if (!HOSTED_ACCESS_REQUIRED) return undefined;
    let active = true;
    let objectUrl = null;
    loadHostedBookPdf(book.original.id)
      .then((url) => {
        objectUrl = url;
        if (active) setPdfUrl(url);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "加密 PDF 加载失败。");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.original.id]);

  useEffect(() => {
    if (!pdfUrl) return undefined;
    let active = true;
    let loadingTask = null;
    import("pdfjs-dist")
      .then((pdfjs) => {
        if (!active) return null;
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjs.getDocument({ url: pdfUrl });
        return loadingTask.promise;
      })
      .then((document) => {
        if (!document) return;
        if (!active) return;
        setPdfDocument(document);
        setTotalPages(document.numPages);
        setPageInput("1");
      })
      .catch(() => {
        if (active) {
          setError(HOSTED_ACCESS_REQUIRED
            ? "PDF 加载失败，请关闭后重试。"
            : "PDF 加载失败，请尝试在 Finder 中打开原文件。");
        }
      });
    return () => {
      active = false;
      loadingTask?.destroy();
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!stageRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || !stageRef.current || !stageWidth) return undefined;
    let active = true;
    let renderTask = null;
    setRendering(true);
    setError("");

    pdfDocument.getPage(page)
      .then((pdfPage) => {
        if (!active) return null;
        const unscaled = pdfPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(stageRef.current.clientWidth - 56, 280);
        const scale = (availableWidth / unscaled.width) * (zoom / 100);
        const viewport = pdfPage.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2.25);
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = pdfPage.render({
          canvasContext: context,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
          viewport,
        });
        return renderTask.promise;
      })
      .then(() => {
        if (active) setRendering(false);
      })
      .catch((renderError) => {
        if (active && renderError?.name !== "RenderingCancelledException") {
          setError(HOSTED_ACCESS_REQUIRED
            ? "这一页暂时无法渲染，请关闭后重试。"
            : "这一页暂时无法渲染，请重试或打开原文件。");
          setRendering(false);
        }
      });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [page, pdfDocument, stageWidth, zoom]);

  const goToPage = (nextPage) => {
    const requested = Math.max(1, Number.parseInt(String(nextPage), 10) || 1);
    const normalized = totalPages ? Math.min(requested, totalPages) : requested;
    setPage(normalized);
    setPageInput(String(normalized));
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  };

  const changeZoom = (nextZoom) => {
    setZoom(Math.min(200, Math.max(50, nextZoom)));
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await shellRef.current?.requestFullscreen();
    }
  };

  return (
    <div
      aria-label={`阅读原版 PDF：${book.title}`}
      aria-modal="true"
      className="pdf-reader"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <section className="pdf-reader__shell" ref={shellRef}>
        <header className="pdf-reader__header">
          <div className="pdf-reader__identity">
            <span className="pdf-reader__mark"><IconFileTypePdf size={19} /></span>
            <span>
              <small>ORIGINAL PDF</small>
              <strong>{book.original.fileName || book.title}</strong>
            </span>
          </div>

          <div className="pdf-reader__controls" aria-label="PDF 阅读控制">
            <div className="pdf-reader__control-group">
              <button
                aria-label="上一页"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                type="button"
              >
                <IconChevronLeft size={17} />
              </button>
              <form
                className="pdf-reader__page-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  goToPage(pageInput);
                }}
              >
                <span>第</span>
                <input
                  aria-label="PDF 页码"
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
                  value={pageInput}
                />
                <span>页</span>
              </form>
              <button aria-label="下一页" disabled={Boolean(totalPages && page >= totalPages)} onClick={() => goToPage(page + 1)} type="button">
                <IconChevronRight size={17} />
              </button>
              {totalPages ? <span className="pdf-reader__page-total mono">/ {totalPages}</span> : null}
            </div>

            <div className="pdf-reader__control-group">
              <button aria-label="缩小" disabled={zoom <= 50} onClick={() => changeZoom(zoom - 10)} type="button">
                <IconMinus size={17} />
              </button>
              <span className="pdf-reader__zoom mono">{zoom}%</span>
              <button aria-label="放大" disabled={zoom >= 200} onClick={() => changeZoom(zoom + 10)} type="button">
                <IconPlus size={17} />
              </button>
            </div>
          </div>

          <div className="pdf-reader__actions">
            {!HOSTED_ACCESS_REQUIRED ? (
              <button onClick={() => openLocalTarget(book.original.id, "finder")} title="在 Finder 显示" type="button">
                <IconFolderOpen size={18} />
              </button>
            ) : null}
            <a download={book.original.fileName || `${book.title}.pdf`} href={pdfUrl || undefined} title="下载 PDF">
              <IconDownload size={18} />
            </a>
            <button onClick={toggleFullscreen} title={isFullscreen ? "退出全屏" : "全屏阅读"} type="button">
              <IconMaximize size={18} />
            </button>
            <button className="pdf-reader__close" onClick={onClose} title="关闭阅读器" type="button">
              <IconX size={19} />
            </button>
          </div>
        </header>

        <div className="pdf-reader__stage" ref={stageRef}>
          {error ? (
            <div className="pdf-reader__error" role="alert">
              <IconFileTypePdf size={28} />
              <strong>{error}</strong>
              {!HOSTED_ACCESS_REQUIRED ? <button onClick={() => openLocalTarget(book.original.id, "finder")} type="button">在 Finder 显示</button> : null}
            </div>
          ) : null}
          {!error && (!pdfDocument || rendering) ? (
            <div className="pdf-reader__loading" role="status">
              <span />
              <strong>{pdfDocument ? `正在绘制第 ${page} 页` : "正在打开原版 PDF"}</strong>
              <small>{pdfDocument ? `${zoom}% · 高清渲染` : "大文件首次加载可能需要几秒"}</small>
            </div>
          ) : null}
          <canvas aria-label={`${book.title}原版 PDF 第 ${page} 页`} ref={canvasRef} />
        </div>
        <footer className="pdf-reader__footer">
          <span>{HOSTED_ACCESS_REQUIRED ? "PDF 已加密传输，并在当前浏览器内解密渲染" : "PDF 在本机浏览器内逐页高清渲染，原文件不会上传"}</span>
          <span className="mono">第 {page}{totalPages ? ` / ${totalPages}` : ""} 页 · ESC 关闭</span>
        </footer>
      </section>
    </div>
  );
}

function BookDetail({ book, onBack, onOpenDocument, savedProgress }) {
  const resume = useMemo(
    () => resolveBookResume(book, savedProgress),
    [book, savedProgress],
  );
  const [language, setLanguage] = useState(
    resume?.language || (book.chapters.zh?.length ? "zh" : "en"),
  );
  const [pdfOpen, setPdfOpen] = useState(false);

  useEffect(() => {
    setLanguage(resume?.language || (book.chapters.zh?.length ? "zh" : "en"));
  }, [book.id, book.chapters.en?.length, book.chapters.zh?.length, resume?.language]);

  const chapters = book.chapters[language] ?? [];
  const groups = useMemo(() => groupChapters(chapters), [chapters]);
  const firstChapter = chapters[0] ?? null;
  const languageResume = resume?.language === language ? resume : null;
  const primaryChapter = languageResume?.chapter || firstChapter;

  const openChapter = (chapter) => {
    if (!chapter) return;
    const initialPosition = languageResume?.chapterId === chapter.id ? languageResume : null;
    onOpenDocument({
      id: chapter.id,
      readerContext: readerContext(book, language, chapter, initialPosition),
    });
  };

  return (
    <div className="page page--books page--book-detail">
      <button className="book-back" onClick={onBack} type="button">
        <IconArrowLeft size={17} /> 返回书架
      </button>

      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="book-detail-hero"
        initial={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.3 }}
      >
        <BookCover book={book} compact />
        <div className="book-detail-hero__content">
          <span className="eyebrow">CURRENT EXAM COURSE</span>
          <h1>{book.title}</h1>
          <p className="book-detail-hero__author">{book.author || "作者未记录"}</p>
          <p className="book-detail-hero__description">
            {book.description || "按考试能力拆分章节，边读边形成可复用的作答方法与复盘记录。"}
          </p>
          <div className="book-detail-hero__meta">
            <span><IconFileText size={15} /> {book.chapterCount} 个章节</span>
            <span><IconPhoto size={15} /> {book.imageCount} 张原图</span>
            <span><IconLanguage size={15} /> {book.languages.length} 个版本</span>
          </div>
          <div className="book-detail-actions">
            <button
              className="book-primary-action"
              disabled={!primaryChapter}
              onClick={() => openChapter(primaryChapter)}
              type="button"
            >
              <IconBook size={18} />
              {languageResume
                ? `继续阅读 · ${languageResume.chapter.title}（${formatBookChapterProgress(languageResume.progress)}）`
                : language === "zh" ? "开始读中文版" : "Start reading"}
            </button>
            {book.original ? (
              <button className="book-original-action" onClick={() => setPdfOpen(true)} type="button">
                <IconFileTypePdf size={17} /> 在站内阅读 PDF
              </button>
            ) : null}
          </div>
        </div>
      </motion.section>

      <section className="chapter-browser">
        <header className="chapter-browser__header">
          <div>
            <span className="eyebrow">TABLE OF CONTENTS</span>
            <h2>章节目录</h2>
          </div>
          <div aria-label="阅读版本" className="chapter-language-tabs" role="tablist">
            {book.languages.map((item) => (
              <button
                aria-selected={language === item.key}
                className={language === item.key ? "is-active" : ""}
                key={item.key}
                onClick={() => setLanguage(item.key)}
                role="tab"
                type="button"
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="chapter-tree">
          {groups.map((group) => (
            <section className="chapter-group" key={group.key}>
              <div className="chapter-group__label">
                <span aria-hidden="true" />
                <strong>{group.label}</strong>
              </div>
              <div className="chapter-group__items">
                {group.chapters.map((chapter) => (
                  <button
                    className={`chapter-row${languageResume?.chapterId === chapter.id ? " chapter-row--resume" : ""}`}
                    key={chapter.id}
                    onClick={() => openChapter(chapter)}
                    type="button"
                  >
                    <span className="chapter-row__number mono">
                      {String(chapter.order).padStart(2, "0")}
                    </span>
                    <span className="chapter-row__title">{chapter.title}</span>
                    <span className="chapter-row__action">
                      {languageResume?.chapterId === chapter.id
                        ? `${formatBookChapterProgress(languageResume.progress)} · 继续`
                        : "阅读"} <IconChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
      {pdfOpen && book.original ? (
        <PdfReaderModal book={book} onClose={() => setPdfOpen(false)} />
      ) : null}
    </div>
  );
}

export function BooksPage({ onOpenDocument }) {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const [result, setResult] = useState(loadingResult);
  const [progressRevision, setProgressRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadBooks().then((response) => {
      if (!cancelled) setResult(response);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refresh = () => setProgressRevision((revision) => revision + 1);
    const onStorage = (event) => {
      if (event.key === BOOK_READING_PROGRESS_KEY) refresh();
    };
    window.addEventListener(BOOK_READING_PROGRESS_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BOOK_READING_PROGRESS_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (result.source === "loading") {
    return (
      <div className="page page--books">
        <PageHeader eyebrow="CIVIL SERVICE COURSES · READING" title="考公课程与书架" description="正在整理本地备考课程与章节……" />
        <div className="books-loading">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </div>
    );
  }

  if (result.error && !result.data) {
    return <div className="page"><div className="error-note">书架加载失败：{result.error.message}</div></div>;
  }

  const data = result.data;
  const readingStorage = bookReadingStorage(window);
  const progressByBook = new Map(
    (data?.books || []).map((book) => [
      book.id,
      loadBookReadingProgress(readingStorage, book.id),
    ]),
  );
  const activeBook = bookId
    ? data?.books?.find((book) => book.id === bookId)
    : null;

  if (bookId && !activeBook) {
    return (
      <div className="page page--books">
        <button className="book-back" onClick={() => navigate("/books")} type="button">
          <IconArrowLeft size={17} /> 返回书架
        </button>
        <div className="books-empty">
          <IconBook2 size={28} stroke={1.5} />
          <strong>没有找到这本书</strong>
          <span>它可能已经改名或移出了本地 Books 目录。</span>
        </div>
      </div>
    );
  }

  return activeBook ? (
    <BookDetail
      book={activeBook}
      onBack={() => navigate("/books")}
      onOpenDocument={onOpenDocument}
      savedProgress={progressByBook.get(activeBook.id)}
    />
  ) : (
    <Shelf
      data={data}
      onOpenBook={(book) => navigate(`/books/${book.id}`)}
      onOpenDocument={onOpenDocument}
      progressByBook={progressByBook}
      revision={progressRevision}
    />
  );
}
