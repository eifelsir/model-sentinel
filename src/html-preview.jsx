import React, { useEffect, useRef, useState } from "react";
import { CodeXml, LoaderCircle, X } from "lucide-react";

export function HtmlPage({ roundId, index, title }) {
  return (
    <iframe
      className="html-page-frame"
      title={title}
      src={`sentinel-preview://artifact/${encodeURIComponent(roundId)}/${index}`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
    />
  );
}

function Thumbnail({ round, index, name }) {
  const [image, setImage] = useState(""), [pending, setPending] = useState(true);
  const ref = useRef(null);
  useEffect(() => {
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      window.sentinel.htmlThumbnail(round.id, index).then(value => {
        if (active) setImage(value);
      }).catch(() => {}).finally(() => { if (active) setPending(false); });
    }, { rootMargin: "80px" });
    if (ref.current) observer.observe(ref.current);
    return () => { active = false; observer.disconnect(); };
  }, [round.id, index]);
  return (
    <span ref={ref} className="html-thumbnail">
      {image ? <img className="html-thumbnail-image" src={image} alt={name} /> : pending ? <LoaderCircle size={16} className="spin" /> : <CodeXml size={19} />}
    </span>
  );
}

export function HtmlGallery({ rounds }) {
  const [selection, setSelection] = useState(null);
  const entries = rounds.filter(round => round.results.some(result => result.type === "html")).slice(0, 8);
  const selected = entries.find(round => round.id === selection?.roundId);
  const htmlResults = selected?.results.map((result, index) => ({ result, index })).filter(item => item.result.type === "html") || [];
  const current = selected?.results[selection?.index];
  if (!entries.length) return null;
  return (
    <section className="html-gallery" aria-label="HTML 动画记录">
      <div className="html-gallery-heading"><strong>HTML 动画</strong><span>最近 8 轮</span></div>
      <div className="html-rounds">
        {entries.map((round, position) => {
          const index = round.results.findIndex(result => result.type === "html" && result.html);
          const failed = index < 0;
          const detecting = round.results.some(result => result.type === "html" && result.status === "detecting");
          const clock = new Date(round.startedAt).toLocaleTimeString("zh-CN", { hour12: false });
          return (
            <button
              type="button"
              key={round.id}
              className={`html-round ${failed ? detecting ? "detecting" : "insufficient" : "generated"} ${selected?.id === round.id ? "selected" : ""}`}
              aria-label={`查看 HTML 第 ${position + 1} 轮`}
              aria-expanded={selected?.id === round.id}
              title={`${clock} · ${failed ? detecting ? "生成中" : "未生成完整页面" : "查看完整页面"}`}
              onClick={() => setSelection(selected?.id === round.id ? null : { roundId: round.id, index: failed ? round.results.findIndex(result => result.type === "html") : index })}
            >
              {failed ? <span className="html-thumbnail html-unavailable">{detecting ? <LoaderCircle size={17} className="spin" /> : <CodeXml size={19} />}<small>{detecting ? "生成中" : "未生成"}</small></span> : <Thumbnail round={round} index={index} name={round.results[index].promptName} />}
              <time>{clock}</time>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="html-expanded-page">
          <header>
            {htmlResults.length > 1 ? (
              <div className="html-tabs" role="tablist" aria-label="本轮 HTML 题目">
                {htmlResults.map(({ result, index }) => <button type="button" role="tab" aria-selected={selection.index === index} key={index} onClick={() => setSelection({ roundId: selected.id, index })}>{result.promptName}</button>)}
              </div>
            ) : <strong>{current?.promptName}</strong>}
            <button className="icon-button" type="button" title="收起 HTML 页面" aria-label="收起 HTML 页面" onClick={() => setSelection(null)}><X size={16} /></button>
          </header>
          {current?.html ? <HtmlPage key={`${selected.id}-${selection.index}`} roundId={selected.id} index={selection.index} title={current.promptName} /> : <p className="html-page-empty">{current?.status === "detecting" ? "正在生成…" : "未收到完整的 SVG HTML 页面"}</p>}
        </div>
      )}
    </section>
  );
}
