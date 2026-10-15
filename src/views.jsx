import React, { useState } from "react";
import {
  Activity,
  Plus,
  Save,
  Pencil,
  Trash2,
  Play,
  Square,
  Settings2,
  Cable,
  Search,
  RefreshCw,
  Download,
  ChevronRight,
  FileText,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import {
  Field,
  IconButton,
  Status,
  Modal,
  HistoryBars,
  uid,
  protocolNames,
  statuses,
  time,
} from "./components.jsx";
import { builtinPrompts } from "../core/builtins.mjs";
import { reasoningCapability } from "../core/reasoning.mjs";
import { UsageBrief, UsageSummary } from "./usage.jsx";

const emptyPrompt = () => ({
  id: "",
  type: "text",
  name: "",
  prompt: "",
  expected: "",
  mode: "auto",
  pattern: "",
});
const emptyConnection = () => ({
  id: "",
  name: "",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  protocol: "responses",
  models: [],
});
const presets = {
  openai: ["OpenAI", "https://api.openai.com/v1", "responses"],
  grok: ["Grok", "https://api.x.ai/v1", "chat"],
  gemini: [
    "Gemini",
    "https://generativelanguage.googleapis.com/v1beta",
    "gemini",
  ],
  claude: ["Claude", "https://api.anthropic.com/v1", "anthropic"],
  custom: ["自定义", "", "chat"],
};
const protocols = Object.entries(protocolNames).map(([value, label]) => (
  <option value={value} key={value}>
    {label}
  </option>
));

export function Workbench({
  state,
  mutate,
  busy,
  perform,
  api,
  setPage,
  openRound,
}) {
  const [draft, setDraft] = useState(() => state.config.prompts[0] ? { ...emptyPrompt(), ...state.config.prompts[0] } : emptyPrompt()),
    [targetId, setTargetId] = useState(null),
    [remove, setRemove] = useState(null);
  const { config, history } = state;
  const field = (key) => ({
    value: draft[key],
    onChange: (e) => setDraft({ ...draft, [key]: e.target.value }),
  });
  const count = (status) =>
    config.targets.filter(
      (t) => history.find((r) => r.targetId === t.id)?.status === status,
    ).length;
  async function savePrompt(e) {
    e.preventDefault();
    const prompt = { ...draft, id: draft.id || uid() };
    try {
      await mutate((c) => {
        const index = c.prompts.findIndex((p) => p.id === prompt.id);
        if (index < 0) c.prompts.push(prompt);
        else c.prompts[index] = prompt;
      });
      setDraft(prompt);
    } catch {}
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MONITOR</div>
          <h1>检测工作台</h1>
        </div>
        <div className="overview">
          <span>
            <i className="legend-dot normal" />
            正常 <b>{count("normal")}</b>
          </span>
          <span>
            <i className="legend-dot degraded" />
            降智 <b>{count("degraded")}</b>
          </span>
          <span>
            <i className="legend-dot insufficient" />
            不足 <b>{count("insufficient")}</b>
          </span>
        </div>
      </div>
      <section className="prompt-section">
        <div className="section-title">
          <FileText size={17} />
          <h2>检测题目</h2>
          <span className="muted">{config.prompts.length} 道已保存</span>
          <button
            type="button"
            className="button plain push-right"
            onClick={() => setDraft(emptyPrompt())}
          >
            <Plus size={15} />
            新建题目
          </button>
        </div>
        <div className="builtin-picker">
          <Field label="内置题目">
            <select value="" onChange={e => {
              const preset = builtinPrompts.find(p => p.id === e.target.value);
              if (!preset) return;
              const saved = config.prompts.find(p => p.prompt === preset.prompt && (p.type || "text") === preset.type);
              setDraft(saved ? { ...saved } : { ...preset, id: "" });
            }}>
              <option value="">选择内置题目</option>
              {builtinPrompts.map(p => <option key={p.id} value={p.id}>{p.name}{p.type === "text" ? ` · ${p.expected}` : " · HTML 动画"}</option>)}
            </select>
          </Field>
        </div>
        <form onSubmit={savePrompt}>
          <div className="prompt-form-top">
            <Field label="题目名称">
              <input
                required
                maxLength={500}
                placeholder="给这道题起个名字"
                {...field("name")}
              />
            </Field>
            <Field label="题目类型">
              <select {...field("type")}>
                <option value="text">文字答案</option>
                <option value="html">HTML / SVG 动画</option>
              </select>
            </Field>
            {draft.type !== "html" && <Field label="提取方式">
              <select {...field("mode")}>
                <option value="auto">自动提取答案</option>
                <option value="exact">完整文本比对</option>
                <option value="regex">正则表达式</option>
              </select>
            </Field>}
          </div>
          <div className={`prompt-pair ${draft.type === "html" ? "html-prompt" : ""}`}>
            <Field label="提示词">
              <textarea
                required
                rows={4}
                placeholder="输入要发送给模型的问题"
                {...field("prompt")}
              />
            </Field>
            {draft.type !== "html" && <Field label="固定答案">
              <textarea
                required
                rows={4}
                placeholder="输入用于比对的正确答案"
                {...field("expected")}
              />
            </Field>}
          </div>
          {draft.type !== "html" && draft.mode === "regex" && (
            <Field label="提取表达式">
              <input
                required
                maxLength={5000}
                placeholder="答案[:：]\\s*(\\d+)"
                {...field("pattern")}
              />
            </Field>
          )}
          <div className="form-bottom">
            <span className="muted">{draft.type === "html" ? "HTML / SVG 动画" : "固定答案仅在本地比对"}</span>
            <button type="submit" className="button primary" disabled={busy}>
              <Save size={15} />
              保存题目
            </button>
          </div>
        </form>
        {config.prompts.length > 0 && (
          <div className="saved-prompts">
            {config.prompts.map((p) => (
              <div
                className={`saved-prompt ${draft.id === p.id ? "editing" : ""}`}
                key={p.id}
              >
                <button
                  type="button"
                  className="prompt-choice"
                  onClick={() => setDraft({ ...p })}
                >
                  <FileText size={14} />
                  <strong>{p.name}</strong>
                  <span title={p.expected}>{p.type === "html" ? "HTML" : p.expected}</span>
                </button>
                <IconButton
                  icon={Pencil}
                  label={`编辑题目 ${p.name}`}
                  onClick={() => setDraft({ ...p })}
                />
                <IconButton
                  icon={Trash2}
                  label={`删除题目 ${p.name}`}
                  onClick={() => setRemove({ kind: "prompt", item: p })}
                />
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="targets-section">
        <div className="section-title">
          <Activity size={17} />
          <h2>监测模型</h2>
          <span className="muted">{config.targets.length} 个</span>
          <button
            type="button"
            className="button secondary push-right"
            onClick={() => setPage("connections")}
          >
            <Plus size={15} />
            添加模型
          </button>
        </div>
        {!config.targets.length ? (
          <div className="empty-state compact-empty">
            <Cable size={26} />
            <h3>还没有监测模型</h3>
            <button
              type="button"
              className="text-link"
              onClick={() => setPage("connections")}
            >
              配置连接与模型 <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <div className="targets-list">
            {config.targets.map((target) => {
              const connection = config.connections.find(
                  (c) => c.id === target.connectionId,
                ),
                round = history.find((r) => r.targetId === target.id),
                active = state.activeTargetIds.includes(target.id);
              return (
                <article
                  className={`target-row ${!target.enabled ? "disabled-row" : ""}`}
                  key={target.id}
                >
                  <div className="target-top">
                    <label className="target-enable" title="启用模型">
                      <input
                        type="checkbox"
                        aria-label={`启用 ${target.model}`}
                        checked={target.enabled}
                        disabled={busy}
                        onChange={(e) => {
                          void mutate((c) => {
                            c.targets.find((t) => t.id === target.id).enabled =
                              e.target.checked;
                          }).catch(() => {});
                        }}
                      />
                    </label>
                    <div className="model-identity">
                      <strong title={target.model}>{target.model}</strong>
                      <small>
                        {connection?.name} ·{" "}
                        {protocolNames[target.protocol || connection?.protocol]}
                      </small>
                    </div>
                    <Status status={round?.status} />
                    <div className="row-actions">
                      <IconButton
                        icon={active ? Square : Play}
                        label={`${active ? "停止" : "检测"} ${target.model}`}
                        onClick={() =>
                          perform(() =>
                            active ? api.stop(target.id) : api.run([target.id]),
                          )
                        }
                      />
                      <IconButton
                        icon={Settings2}
                        label={`模型设置 ${target.model}`}
                        onClick={() => setTargetId(target.id)}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`删除模型 ${target.model}`}
                        onClick={() =>
                          setRemove({ kind: "target", item: target })
                        }
                      />
                    </div>
                  </div>
                  <div className="target-bottom">
                    <span>
                      {target.promptIds.length} 道题目 · 每{" "}
                      {target.intervalMinutes} 分钟
                    </span>
                    <span>上次 {time(round?.completedAt)}</span>
                    {round && <UsageBrief round={round} />}
                    {round && (
                      <button
                        type="button"
                        className="text-link answer-link"
                        title={round.results
                          .map((r) => r.answer)
                          .filter(Boolean)
                          .join(" / ")}
                        onClick={() => openRound(round.id)}
                      >
                        答案{" "}
                        {round.results
                          .map((r) => r.answer)
                          .filter(Boolean)
                          .join(" / ") || "—"}
                        <ChevronRight size={12} />
                      </button>
                    )}
                    {state.nextRuns[target.id] && (
                      <span>下次 {time(state.nextRuns[target.id])}</span>
                    )}
                  </div>
                  {round && (
                    <HistoryBars
                      rounds={history.filter((r) => r.targetId === target.id)}
                      onOpen={openRound}
                    />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      {targetId && config.targets.some((t) => t.id === targetId) && (
        <TargetSettings
          key={targetId}
          target={config.targets.find((t) => t.id === targetId)}
          config={config}
          mutate={mutate}
          busy={busy}
          onClose={() => setTargetId(null)}
        />
      )}
      {remove && (
        <Modal
          title={remove.kind === "prompt" ? "删除题目" : "删除监测模型"}
          onClose={() => setRemove(null)}
        >
          <p>确认删除「{remove.item.name || remove.item.model}」？</p>
          <p className="muted">
            {remove.kind === "prompt"
              ? "该题目将从所有模型的检测列表中移除。"
              : "已有检测历史会保留。"}
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setRemove(null)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                try {
                  await mutate((c) => {
                    if (remove.kind === "prompt") {
                      c.prompts = c.prompts.filter(
                        (p) => p.id !== remove.item.id,
                      );
                      c.targets.forEach((t) => {
                        t.promptIds = t.promptIds.filter(
                          (id) => id !== remove.item.id,
                        );
                      });
                      if (draft.id === remove.item.id) setDraft(emptyPrompt());
                    } else
                      c.targets = c.targets.filter(
                        (t) => t.id !== remove.item.id,
                      );
                  });
                  setRemove(null);
                } catch {}
              }}
            >
              确认删除
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function TargetSettings({ target, config, mutate, busy, onClose }) {
  const [draft, setDraft] = useState({ ...target }),
    [json, setJson] = useState(
      Object.keys(target.extraBody).length
        ? JSON.stringify(target.extraBody, null, 2)
        : "",
    ),
    [error, setError] = useState("");
  const update = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const connection = config.connections.find(c => c.id === draft.connectionId);
  const capability = reasoningCapability(draft.model, draft.protocol || connection?.protocol);
  const effortNames = { none: "关闭思考", minimal: "最少思考", low: "低", medium: "中", high: "高", xhigh: "超高", max: "最高", dynamic: "动态" };
  async function save(e) {
    e.preventDefault();
    setError("");
    let extraBody;
    try {
      extraBody = json.trim() ? JSON.parse(json) : {};
      if (
        !extraBody ||
        Array.isArray(extraBody) ||
        typeof extraBody !== "object"
      )
        throw Error();
    } catch {
      setError("额外请求参数必须是 JSON 对象。");
      return;
    }
    const updated = {
      ...draft,
      intervalMinutes: Number(draft.intervalMinutes),
      timeoutSeconds: Number(draft.timeoutSeconds),
      maxOutputTokens:
        draft.maxOutputTokens === "" || draft.maxOutputTokens == null
          ? null
          : Number(draft.maxOutputTokens),
      extraBody,
    };
    try {
      await mutate((c) => {
        c.targets[c.targets.findIndex((t) => t.id === target.id)] = updated;
      });
      onClose();
    } catch {}
  }
  return (
    <Modal title="模型检测设置" onClose={onClose}>
      <form onSubmit={save}>
        <div className="settings-model">{target.model}</div>
        <Field label="请求协议">
          <select value={draft.protocol} onChange={update("protocol")}>
            <option value="">跟随连接</option>
            {protocols}
          </select>
        </Field>
        <fieldset className="prompt-assignment">
          <legend>关联题目</legend>
          {config.prompts.length ? (
            config.prompts.map((prompt) => (
              <label key={prompt.id}>
                <input
                  type="checkbox"
                  aria-label={`关联题目 ${prompt.name}`}
                  checked={draft.promptIds.includes(prompt.id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      promptIds: e.target.checked
                        ? [...draft.promptIds, prompt.id]
                        : draft.promptIds.filter((id) => id !== prompt.id),
                    })
                  }
                />
                <span>
                  {prompt.name}
                  <small>{prompt.type === "html" ? "HTML / SVG 动画" : `答案：${prompt.expected}`}</small>
                </span>
              </label>
            ))
          ) : (
            <p className="muted">尚未保存题目</p>
          )}
        </fieldset>
        <div className="two-columns">
          <Field label="检测间隔（分钟）">
            <input
              type="number"
              min="0.001"
              max="525600"
              step="any"
              required
              value={draft.intervalMinutes}
              onChange={update("intervalMinutes")}
            />
          </Field>
          <Field label="请求超时（秒）">
            <input
              type="number"
              min="0.01"
              max="3600"
              step="any"
              required
              value={draft.timeoutSeconds}
              onChange={update("timeoutSeconds")}
            />
          </Field>
        </div>
        <Field label="推理强度" hint={!capability.efforts.length ? "当前模型或协议未声明可调档位" : capability.kind === "gemini-budget" ? "思考预算档位" : undefined}>
          <select value={draft.reasoningEffort || ""} onChange={update("reasoningEffort")}>
            <option value="">由服务决定</option>
            {draft.reasoningEffort && !capability.efforts.includes(draft.reasoningEffort) && <option value={draft.reasoningEffort} disabled>当前档位不适用，请重新选择</option>}
            {capability.efforts.map(effort => <option value={effort} key={effort}>{effortNames[effort]}</option>)}
          </select>
        </Field>
        <Field label="最大输出 Token">
          <input
            type="number"
            min="1"
            max="1000000"
            step="1"
            placeholder="留空，由服务决定"
            value={draft.maxOutputTokens ?? ""}
            onChange={update("maxOutputTokens")}
          />
        </Field>
        <Field label="额外请求参数（JSON）">
          <textarea
            className="code-input"
            rows={5}
            placeholder={"{\n  \n}"}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </Field>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={busy}>
            <Save size={15} />
            保存模型设置
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Connections({ state, mutate, busy, perform, api }) {
  const [draft, setDraft] = useState(() =>
    state.config.connections[0]
      ? { ...state.config.connections[0], apiKey: "" }
      : emptyConnection(),
  );
  const [models, setModels] = useState(draft.models || []),
    [selected, setSelected] = useState([]),
    [search, setSearch] = useState(""),
    [manual, setManual] = useState("");
  const [discovering, setDiscovering] = useState(false),
    [discoveryError, setDiscoveryError] = useState(""),
    [deleteId, setDeleteId] = useState(null);
  const field = (key) => ({
    value: draft[key],
    onChange: (e) => setDraft({ ...draft, [key]: e.target.value }),
  });
  function choose(connection) {
    const next = connection ? { ...connection, apiKey: "" } : emptyConnection();
    setDraft(next);
    setModels(next.models || []);
    setSelected([]);
    setSearch("");
    setManual("");
    setDiscoveryError("");
  }
  async function persistConnection(catalog = models) {
    const connection = { ...draft, id: draft.id || uid(), models: catalog };
    const result = await mutate((c) => {
      const index = c.connections.findIndex((x) => x.id === connection.id);
      if (index < 0) c.connections.push(connection);
      else c.connections[index] = connection;
    });
    const saved = result.config.connections.find((c) => c.id === connection.id);
    setDraft({ ...saved, apiKey: "" });
    return saved;
  }
  async function discover() {
    setDiscovering(true);
    setDiscoveryError("");
    try {
      const found = await api.listModels(draft);
      setModels(found);
      setSelected([]);
      if (draft.id) await persistConnection(found);
    } catch (e) {
      setDiscoveryError(e.message || "拉取失败，请手动添加模型 ID。");
    } finally {
      setDiscovering(false);
    }
  }
  async function addModels(ids) {
    if (!ids.length) return;
    try {
      const saved = await persistConnection([...new Set([...models, ...ids])]);
      await mutate((c) => {
        for (const model of ids) {
          if (
            !c.targets.some(
              (t) =>
                t.connectionId === saved.id &&
                t.model === model &&
                (t.protocol || saved.protocol) === saved.protocol,
            )
          )
            c.targets.push({
              id: uid(),
              connectionId: saved.id,
              model,
              protocol: saved.protocol,
              promptIds: c.prompts.map((p) => p.id),
              enabled: true,
              intervalMinutes: 30,
              timeoutSeconds: 180,
              maxOutputTokens: null,
              reasoningEffort: "",
              extraBody: {},
            });
        }
      }, `已添加 ${ids.length} 个模型`);
      setModels([...new Set([...models, ...ids])]);
      setSelected([]);
      setManual("");
    } catch {}
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONNECTIONS</div>
          <h1>连接与模型</h1>
        </div>
        <button className="button secondary" onClick={() => choose(null)}>
          <Plus size={15} />
          新建连接
        </button>
      </div>
      <div className="connections-layout">
        <aside className="connection-list">
          <div className="list-caption">
            已保存连接 <span>{state.config.connections.length}</span>
          </div>
          {state.config.connections.map((c) => (
            <div
              key={c.id}
              className={`connection-item ${draft.id === c.id ? "selected" : ""}`}
            >
              <button type="button" onClick={() => choose(c)}>
                <Cable size={16} />
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {presets[c.provider]?.[0] || "自定义"} · {c.models.length}{" "}
                    个模型
                  </small>
                </span>
              </button>
              <IconButton
                icon={Trash2}
                label={`删除连接 ${c.name}`}
                onClick={() => setDeleteId(c.id)}
              />
            </div>
          ))}
          {!state.config.connections.length && (
            <p className="muted">暂无连接</p>
          )}
        </aside>
        <div className="connection-editor">
          <section>
            <div className="section-title">
              <Cable size={17} />
              <h2>{draft.id ? "连接配置" : "新建连接"}</h2>
              {draft.hasKey && (
                <span className="key-saved">
                  <Check size={12} />
                  KEY 已保存
                </span>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void persistConnection().catch(() => {});
              }}
            >
              <div className="two-columns">
                <Field label="连接名称">
                  <input
                    required
                    maxLength={500}
                    placeholder="例如：我的 OpenAI"
                    {...field("name")}
                  />
                </Field>
                <Field label="服务商">
                  <select
                    value={draft.provider}
                    onChange={(e) => {
                      const provider = e.target.value,
                        preset = presets[provider];
                      setDraft({
                        ...draft,
                        provider,
                        baseUrl:
                          !draft.baseUrl ||
                          Object.values(presets).some(
                            (p) => p[1] === draft.baseUrl,
                          )
                            ? preset[1]
                            : draft.baseUrl,
                        protocol: preset[2],
                      });
                    }}
                  >
                    {Object.entries(presets).map(([id, preset]) => (
                      <option value={id} key={id}>
                        {preset[0]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Base URL">
                <input
                  required
                  type="url"
                  placeholder="https://api.example.com/v1"
                  {...field("baseUrl")}
                />
              </Field>
              <div className="two-columns">
                <Field label="API KEY">
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      draft.hasKey ? "已保存，留空保留原 KEY" : "输入 API KEY"
                    }
                    {...field("apiKey")}
                  />
                </Field>
                <Field label="请求协议">
                  <select {...field("protocol")}>{protocols}</select>
                </Field>
              </div>
              <div className="form-bottom">
                <span className="muted">KEY 在此设备加密保存</span>
                <button
                  className="button primary"
                  disabled={busy || discovering}
                >
                  <Save size={15} />
                  保存连接
                </button>
              </div>
            </form>
          </section>
          <section className="model-catalog">
            <div className="section-title">
              <Activity size={17} />
              <h2>模型列表</h2>
              <span className="muted">{models.length} 个</span>
              <button
                type="button"
                className="button secondary push-right"
                disabled={discovering || busy || !draft.baseUrl}
                onClick={discover}
              >
                <RefreshCw size={15} className={discovering ? "spin" : ""} />
                {discovering ? "正在拉取…" : "拉取模型"}
              </button>
            </div>
            {discoveryError && (
              <div className="inline-error" role="alert">
                {discoveryError}
              </div>
            )}
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="搜索模型"
                placeholder="搜索模型 ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="catalog-list">
              {models
                .filter((m) => m.toLowerCase().includes(search.toLowerCase()))
                .map((model) => (
                  <label key={model} className="catalog-model">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${model}`}
                      checked={selected.includes(model)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, model]
                            : selected.filter((x) => x !== model),
                        )
                      }
                    />
                    <span title={model}>{model}</span>
                    {state.config.targets.some(
                      (t) =>
                        t.connectionId === draft.id &&
                        t.model === model &&
                        t.protocol === draft.protocol,
                    ) && <small>已添加</small>}
                  </label>
                ))}
              {!models.length && (
                <div className="catalog-empty">尚未拉取模型</div>
              )}
              {models.length > 0 &&
                !models.some((m) =>
                  m.toLowerCase().includes(search.toLowerCase()),
                ) && <div className="catalog-empty">没有匹配的模型</div>}
            </div>
            <div className="catalog-actions">
              <span className="muted">已选择 {selected.length} 个</span>
              <button
                type="button"
                className="button primary"
                disabled={
                  busy || discovering || !selected.length || !draft.name.trim()
                }
                onClick={() => addModels(selected)}
              >
                <Plus size={15} />
                添加所选模型
              </button>
            </div>
            <form
              className="manual-model"
              onSubmit={(e) => {
                e.preventDefault();
                void addModels([manual.trim()]);
              }}
            >
              <Field label="手动模型 ID">
                <input
                  required
                  maxLength={500}
                  placeholder="输入完整模型 ID"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                />
              </Field>
              <button
                className="button secondary"
                disabled={
                  busy || discovering || !manual.trim() || !draft.name.trim()
                }
              >
                <Plus size={15} />
                添加模型
              </button>
            </form>
          </section>
        </div>
      </div>
      {deleteId && (
        <Modal title="删除连接" onClose={() => setDeleteId(null)}>
          <p>确认删除此连接及其监测模型？已有历史会保留。</p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteId(null)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                try {
                  await mutate((c) => {
                    c.connections = c.connections.filter(
                      (x) => x.id !== deleteId,
                    );
                    c.targets = c.targets.filter(
                      (t) => t.connectionId !== deleteId,
                    );
                  });
                  if (draft.id === deleteId) choose(null);
                  setDeleteId(null);
                } catch {}
              }}
            >
              确认删除
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function HistoryPage({ state, openRound }) {
  const [target, setTarget] = useState(""),
    [status, setStatus] = useState("");
  const rows = state.history.filter(
    (r) =>
      (!target || r.targetId === target) && (!status || r.status === status),
  );
  const historicTargets = [
    ...new Map(state.history.map((r) => [r.targetId, r.model])).entries(),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">HISTORY</div>
          <h1>检测历史</h1>
        </div>
        <span className="muted">最近 {state.history.length} 轮</span>
      </div>
      <div className="history-filters">
        <SlidersHorizontal size={17} />
        <Field label="筛选模型">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">全部模型</option>
            {historicTargets.map(([id, model]) => (
              <option value={id} key={id}>
                {model}
              </option>
            ))}
          </select>
        </Field>
        <Field label="筛选状态">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            {Object.entries(statuses)
              .filter(([key]) => key !== "pending")
              .map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
          </select>
        </Field>
        <span className="muted push-right">{rows.length} 条记录</span>
      </div>
      {!rows.length ? (
        <div className="empty-state">
          <HistoryIcon />
          <h3>暂无检测记录</h3>
          <p>完成检测后，结果会保存在这里。</p>
        </div>
      ) : (
        <div className="history-table">
          <div className="history-table-head">
            <span>模型 / 连接</span>
            <span>状态</span>
            <span>题目结果</span>
            <span>检测时间</span>
            <span />
          </div>
          {rows.map((round) => (
            <article className="history-table-row" key={round.id}>
              <div className="history-model">
                <strong title={round.model}>{round.model}</strong>
                <small>
                  {round.connectionName} · {protocolNames[round.protocol]}
                </small>
              </div>
              <Status status={round.status} />
              <span className="round-counts">
                {round.results.filter((r) => r.status === "normal").length} /{" "}
                {round.results.length} 正常
              </span>
              <time>{time(round.startedAt, true)}</time>
              <IconButton
                icon={ChevronRight}
                label="查看详情"
                onClick={() => openRound(round.id)}
              />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function HistoryIcon() {
  return <FileText size={28} />;
}

export function SettingsPage({ state, mutate, busy, perform, api }) {
  const settings = state.config.settings;
  const [concurrency, setConcurrency] = useState(settings.concurrency),
    [exporting, setExporting] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PREFERENCES</div>
          <h1>设置</h1>
        </div>
      </div>
      <div className="settings-page">
        <UsageSummary history={state.history} />
        <section>
          <div className="section-title">
            <Settings2 size={17} />
            <h2>检测与运行</h2>
          </div>
          <form
            className="setting-row"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await mutate((c) => {
                  c.settings.concurrency = Number(concurrency);
                });
              } catch {}
            }}
          >
            <div>
              <strong>并发请求数</strong>
              <p>同时执行的题目请求上限</p>
            </div>
            <input
              type="number"
              min="1"
              max="32"
              step="1"
              required
              aria-label="并发请求数"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
            />
            <button className="button secondary" disabled={busy}>
              <Save size={15} />
              保存
            </button>
          </form>
          <SettingToggle
            label="自动检测"
            description="按各模型设置的间隔执行检测"
            checked={settings.autoRun}
            onChange={(value) => perform(() => api.setAuto(value))}
          />
          <SettingToggle
            label="显示悬浮窗"
            description="在桌面显示检测状态"
            checked={settings.floatVisible}
            onChange={(value) => perform(() => api.setFloatVisible(value))}
          />
          <SettingToggle
            label="开机启动"
            description="登录 Windows 后在托盘运行"
            checked={settings.launchAtLogin}
            disabled={busy}
            onChange={(value) => {
              void mutate((c) => {
                c.settings.launchAtLogin = value;
              }).catch(() => {});
            }}
          />
        </section>
        <section>
          <div className="section-title">
            <Download size={17} />
            <h2>本地数据</h2>
          </div>
          <div className="setting-row">
            <div>
              <strong>导出配置与检测历史</strong>
              <p>导出文件包含题目、模型设置和检测结果，KEY 会隐藏</p>
            </div>
            <button
              className="button secondary"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await api.exportData();
                } catch (e) {
                  perform(() => Promise.reject(e));
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download size={15} />
              导出数据
            </button>
          </div>
          <div className="data-counts">
            <span>{state.config.connections.length} 个连接</span>
            <span>{state.config.prompts.length} 道题目</span>
            <span>{state.config.targets.length} 个模型</span>
            <span>{state.history.length} 轮记录</span>
          </div>
          <div className="data-location"><strong>保存位置</strong><span className="data-directory">{state.appInfo.dataDirectory}</span></div>
        </section>
        <div className="about">
          <strong>模型检测</strong>
          <span>Model Sentinel {state.appInfo.version}</span>
        </div>
      </div>
    </>
  );
}
function SettingToggle({ label, description, checked, onChange, disabled }) {
  return (
    <label className="setting-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
