import { useState } from "react";
import { IconKey, IconLock } from "@tabler/icons-react";
import { HOSTED_ACCESS_REQUIRED, unlockHostedData } from "../lib/api";
import "./hosted-access.css";

export function HostedAccessGate({ children }) {
  const [unlocked, setUnlocked] = useState(!HOSTED_ACCESS_REQUIRED);
  const [accessKey, setAccessKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (unlocked) return children;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await unlockHostedData(accessKey);
      setUnlocked(true);
    } catch (unlockError) {
      setError(unlockError.message || "访问密钥无法验证。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hosted-access">
      <section className="hosted-access__card" aria-labelledby="hosted-access-title">
        <div className="hosted-access__mark" aria-hidden="true">
          <IconLock stroke={1.8} />
        </div>
        <p className="hosted-access__eyebrow">CIVIL SERVICE · PRIVATE DESK</p>
        <h1 id="hosted-access-title">考公作战台</h1>
        <p className="hosted-access__description">
          这是受保护的分享页面。请输入页面所有者提供的访问密钥。
        </p>
        <form className="hosted-access__form" onSubmit={submit}>
          <label htmlFor="hosted-access-key">访问密钥</label>
          <div className="hosted-access__input-wrap">
            <IconKey aria-hidden="true" stroke={1.7} />
            <input
              autoComplete="current-password"
              autoFocus
              id="hosted-access-key"
              onChange={(event) => setAccessKey(event.target.value)}
              placeholder="请输入访问密钥"
              type="password"
              value={accessKey}
            />
          </div>
          {error ? <p className="hosted-access__error" role="alert">{error}</p> : null}
          <button disabled={busy || !accessKey.trim()} type="submit">
            {busy ? "正在验证…" : "进入工作台"}
          </button>
        </form>
        <p className="hosted-access__note">密钥只用于在当前浏览器中解密页面数据。</p>
      </section>
    </main>
  );
}
