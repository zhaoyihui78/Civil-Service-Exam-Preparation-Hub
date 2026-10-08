import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  IconBooks,
  IconCommand,
  IconHome,
  IconLibrary,
  IconMenu2,
  IconRadar2,
  IconSearch,
  IconSettings,
  IconStack2,
  IconTargetArrow,
  IconTopologyStar3,
} from "@tabler/icons-react";

const navigationSections = [
  {
    label: "总览",
    items: [{ to: "/", label: "今日总览", icon: IconHome, end: true }],
  },
  {
    label: "报考中心",
    items: [{ to: "/opportunities", label: "岗位雷达", icon: IconTargetArrow }],
  },
  {
    label: "备考中心",
    items: [
      { to: "/materials", label: "备考资料", icon: IconStack2 },
      { to: "/books", label: "课程与书架", icon: IconBooks },
      { to: "/wiki", label: "知识库", icon: IconLibrary },
      { to: "/graph", label: "知识地图", icon: IconTopologyStar3 },
      { to: "/daily-hot", label: "时政热点", icon: IconRadar2 },
    ],
  },
];

export function AppShell({ children, onOpenSearch, sync }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button
          aria-label="打开导航"
          className="icon-button"
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          <IconMenu2 aria-hidden="true" />
        </button>
        <span className="mobile-header__brand">
          <img alt="" aria-hidden="true" src="/workbench-mark.svg" />
          <span>考公作战台</span>
        </span>
        <button
          aria-label="搜索"
          className="icon-button"
          onClick={onOpenSearch}
          type="button"
        >
          <IconSearch aria-hidden="true" />
        </button>
      </header>

      {mobileOpen ? (
        <button
          aria-label="关闭导航"
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <aside className={`sidebar${mobileOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar__top">
          <div className="sidebar__brand-row">
            <NavLink className="sidebar__brand" onClick={() => setMobileOpen(false)} to="/">
              <img alt="" aria-hidden="true" src="/workbench-mark.svg" />
              <span>考公作战台</span>
            </NavLink>
          </div>
          <div className="sidebar__tag">CIVIL SERVICE STUDY DESK</div>

          <nav aria-label="主要导航" className="sidebar__nav">
            {navigationSections.map((section) => (
              <section className="sidebar__nav-section" key={section.label}>
                <span className="sidebar__nav-label">{section.label}</span>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      className={({ isActive }) =>
                        `sidebar__nav-item${isActive ? " sidebar__nav-item--active" : ""}`
                      }
                      end={item.end}
                      key={item.to}
                      onClick={() => setMobileOpen(false)}
                      to={item.to}
                    >
                      <Icon aria-hidden="true" className="sidebar__nav-icon" stroke={1.7} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </section>
            ))}
          </nav>
        </div>

        <div className="sidebar__bottom">
          <div className={`sidebar__sync sidebar__sync--${sync?.status || "connecting"}`}>
            <span aria-hidden="true" />
            <span>{sync?.status === "hosted" ? "公开只读展示" : sync?.status === "watching" ? "文件已实时同步" : sync?.status === "rebuilding" || sync?.status === "pending" ? "正在同步文件" : "正在连接文件同步"}</span>
          </div>
          <NavLink
            className="sidebar__settings"
            onClick={() => setMobileOpen(false)}
            to="/system"
          >
            <IconSettings aria-hidden="true" stroke={1.6} />
            <span>系统状态</span>
          </NavLink>
        </div>
      </aside>

      <main className="app-main">{children}</main>

      <button
        aria-label="打开全局搜索"
        className="floating-search"
        onClick={onOpenSearch}
        type="button"
      >
        <IconSearch aria-hidden="true" />
        <span>搜索备考资料</span>
        <span className="floating-search__shortcut">
          <IconCommand aria-hidden="true" />K
        </span>
      </button>
    </div>
  );
}
