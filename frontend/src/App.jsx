import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Activity, AlertCircle, ArrowUpRight, Camera, Check, ChevronRight, Database,
  FileImage, FileText, ImagePlus, LoaderCircle, Plus, RefreshCw, RotateCw, Save,
  ShieldCheck, Trash2, UploadCloud, WandSparkles
} from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from "recharts";
import {
  CHART_GUIDE, CHART_INFO, CHART_OPTIONS, GENERAL_APPLICATIONS, GENERAL_BENEFITS
} from "./chartInfo";

const API = "http://127.0.0.1:8000/api";

const emptyData = {
  question_text: "",
  problem_type: "unknown",
  chart_type: "auto",
  dataset_title: "",
  column_headers: [],
  sample_means: [],
  sample_ranges: [],
  observations: [],
  defect_counts: [],
  sample_sizes: [],
  sample_size: null,
  subgroup_size: null,
  control_chart_constants: {},
  specification_limits: { lsl: null, usl: null },
  units: null,
  given_values: {},
  extraction_warnings: [],
  uncertain_readings: []
};

/* ---------- helpers ---------- */

const TYPE_ALIASES = {
  xbar_r: "xbar_r", xbar: "xbar_r", x_bar_r: "xbar_r", xbarr: "xbar_r", xr: "xbar_r",
  p: "p_chart", p_chart: "p_chart", np: "np_chart", np_chart: "np_chart",
  c: "c_chart", c_chart: "c_chart", u: "u_chart", u_chart: "u_chart"
};

function normalizeType(value) {
  const key = String(value || "").toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  return TYPE_ALIASES[key] || "";
}

function safeJsonParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function flattenNumbers(value) {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(flattenNumbers);
  return [];
}

function parseNumbers(text) {
  return String(text || "")
    .replace(/[[\]]/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

function parseRows(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(parseNumbers)
    .filter((row) => row.length > 0);
}

const pretty = (value) => JSON.stringify(value, null, 2);

function fmt(x) {
  return Number.isFinite(x) ? String(+Number(x).toFixed(4)) : "-";
}

function limitText(list) {
  const same = list.every((v) => Math.abs(v - list[0]) < 1e-12);
  return same ? fmt(list[0]) : `${fmt(Math.min(...list))} to ${fmt(Math.max(...list))}`;
}

function errorText(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join("; ");
  if (err?.message === "Network Error") {
    return "Cannot reach the backend at http://127.0.0.1:8000. Start it with: uvicorn main:app --reload";
  }
  return fallback;
}

/* ---------- small components ---------- */

function Field({ label, hint, count, wide, children }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span className="field-top">
        <span className="field-label">{label}</span>
        {count != null && <span className="count">{count}</span>}
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Prose({ text }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((para, i) => {
        const m = para.match(/^([A-Za-z][A-Za-z ,'’/-]{2,40}):\s*([\s\S]*)$/);
        return m
          ? <p key={i}><strong>{m[1]}:</strong> {m[2]}</p>
          : <p key={i}>{para}</p>;
      })}
    </>
  );
}

function ControlChart({ chart }) {
  const outside = new Set(chart.out_of_control.map((s) => s.index));
  const data = chart.points.map((value, i) => ({
    index: i + 1,
    value,
    ucl: chart.ucl[i],
    lcl: chart.lcl[i],
    cl: chart.center_line,
    out: outside.has(i + 1)
  }));
  const constantLimits =
    chart.ucl.every((v) => v === chart.ucl[0]) && chart.lcl.every((v) => v === chart.lcl[0]);

  const renderDot = ({ cx, cy, payload, index }) =>
    cx == null || cy == null ? null : (
      <circle
        key={`dot-${index}`} cx={cx} cy={cy} r={payload.out ? 6 : 4}
        fill={payload.out ? "#c0262d" : "#1d4ed8"} stroke="#ffffff" strokeWidth={1.5}
      />
    );

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>{chart.name}</h3>
        <div className="chart-limits">
          <span className="lim ucl">UCL {limitText(chart.ucl)}</span>
          <span className="lim cl">Center {fmt(chart.center_line)}</span>
          <span className="lim lcl">LCL {limitText(chart.lcl)}</span>
        </div>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 20, bottom: 22, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e6ee" />
            {constantLimits && (
              <ReferenceArea y1={chart.lcl[0]} y2={chart.ucl[0]} fill="#e3ebfd" fillOpacity={0.55} ifOverflow="extendDomain" />
            )}
            <XAxis
              dataKey="index" tick={{ fill: "#5a6677", fontSize: 12 }}
              label={{ value: "Sample number", position: "insideBottom", offset: -10, fill: "#7a8696", fontSize: 12 }}
            />
            <YAxis
              width={58} domain={["auto", "auto"]} tick={{ fill: "#5a6677", fontSize: 12 }}
              tickFormatter={(v) => fmt(v)}
              label={{ value: chart.y_label, angle: -90, position: "insideLeft", offset: 6, fill: "#7a8696", fontSize: 12, style: { textAnchor: "middle" } }}
            />
            <Tooltip formatter={(v, name) => [fmt(v), name]} labelFormatter={(l) => `Sample ${l}`} />
            <Legend verticalAlign="top" height={30} />
            <Line type="stepAfter" dataKey="ucl" name="UCL" stroke="#c0262d" strokeDasharray="6 4" strokeWidth={1.6} dot={false} activeDot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="cl" name="Center line" stroke="#17753f" strokeWidth={1.6} dot={false} activeDot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="lcl" name="LCL" stroke="#c0262d" strokeDasharray="6 4" strokeWidth={1.6} dot={false} activeDot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="value" name={chart.y_label} stroke="#1d4ed8" strokeWidth={2} dot={renderDot} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BulletList({ items }) {
  return <ul className="bullets">{items.map((t) => <li key={t}>{t}</li>)}</ul>;
}

/* ---------- main app ---------- */

export default function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [rotation, setRotation] = useState(0);
  const [savedImagePreview, setSavedImagePreview] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMediaType, setImageMediaType] = useState(null);
  const [extracted, setExtracted] = useState(emptyData);
  const [jsonText, setJsonText] = useState(pretty(emptyData));
  const [title, setTitle] = useState("");
  const [savedQuestions, setSavedQuestions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [chartType, setChartType] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [nValue, setNValue] = useState("");
  const [rawRows, setRawRows] = useState("");

  const [result, setResult] = useState(null);
  const [interpretation, setInterpretation] = useState("");
  const [interpretError, setInterpretError] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [explainTab, setExplainTab] = useState("results");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [health, setHealth] = useState(null);

  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const resultRef = useRef(null);

  const info = CHART_INFO[chartType];
  const warnings = [...(extracted.extraction_warnings || []), ...(extracted.uncertain_readings || [])]
    .map((w) => (typeof w === "string" ? w : JSON.stringify(w)));
  const detected = normalizeType(extracted.chart_type) || normalizeType(extracted.problem_type);
  const totalOut = result ? result.charts.reduce((s, c) => s + c.out_of_control.length, 0) : 0;

  useEffect(() => {
    refreshQuestions();
    axios.get(`${API}/health`)
      .then((res) => setHealth(res.data))
      .catch(() => setHealth({ status: "offline", api_key_configured: false }));
  }, []);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  async function refreshQuestions() {
    try {
      const response = await axios.get(`${API}/questions`);
      setSavedQuestions(response.data.questions || []);
    } catch { /* status shown in sidebar */ }
  }

  function clearResult() {
    setResult(null);
    setInterpretation("");
    setInterpretError("");
  }

  /* Copy extracted values into the editable data fields */
  function fillFields(data) {
    const means = flattenNumbers(data.sample_means);
    const ranges = flattenNumbers(data.sample_ranges);
    const counts = flattenNumbers(data.defect_counts);
    const sizes = flattenNumbers(data.sample_sizes);
    const obs = data.observations;
    const nested = Array.isArray(obs) && obs.length > 0 && Array.isArray(obs[0]);

    if (means.length) {
      setPrimary(means.join(", "));
      setSecondary(ranges.join(", "));
      setRawRows("");
    } else if (nested) {
      setPrimary("");
      setSecondary("");
      setRawRows(obs.map((row) => flattenNumbers(row).join(", ")).join("\n"));
    } else {
      setPrimary((counts.length ? counts : flattenNumbers(obs)).join(", "));
      setSecondary(sizes.join(", "));
      setRawRows("");
    }
    const n = data.subgroup_size ?? data.sample_size;
    setNValue(n == null ? "" : String(n));
  }

  function loadData(data, nextTitle, typeHint) {
    const merged = { ...emptyData, ...data };
    setExtracted(merged);
    setJsonText(pretty(merged));
    setTitle(nextTitle || merged.dataset_title || "");
    setChartType(normalizeType(typeHint) || normalizeType(merged.chart_type) || normalizeType(merged.problem_type));
    fillFields(merged);
    clearResult();
  }

  /* Put whatever the user typed back into the JSON before saving */
  function snapshotData(base) {
    const d = { ...base };
    const n = nValue.trim() === "" || !Number.isFinite(Number(nValue)) ? null : Number(nValue);
    if (chartType) d.chart_type = chartType;
    if (chartType === "xbar_r") {
      d.sample_means = parseNumbers(primary);
      d.sample_ranges = parseNumbers(secondary);
      d.observations = parseRows(rawRows);
      d.subgroup_size = n;
    } else if (chartType) {
      d.defect_counts = parseNumbers(primary);
      d.sample_sizes = parseNumbers(secondary);
      d.sample_size = n;
    }
    return d;
  }

  function handleFile(nextFile) {
    setError("");
    setNotice("");
    if (!nextFile) return;
    if (!nextFile.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG or WebP).");
      return;
    }
    setRotation(0);
    setSavedImagePreview("");
    setFile(nextFile);
  }

  async function extractQuestion() {
    if (!file) { setError("Upload or capture an image first."); return; }
    setLoading(true);
    setError("");
    setNotice("");
    clearResult();
    const form = new FormData();
    form.append("image", file);
    form.append("rotate", String(rotation));
    try {
      const response = await axios.post(`${API}/extract`, form);
      setImageBase64(response.data.image_base64);
      setImageMediaType(response.data.media_type);
      loadData(response.data.extracted_data, response.data.extracted_data.dataset_title || file.name.replace(/\.[^.]+$/, ""));
      setNotice("Extraction finished. Compare every number below with your photo, then choose a chart type.");
    } catch (err) {
      setError(errorText(err, "Extraction failed. Check that the backend is running and the API key is set."));
    } finally {
      setLoading(false);
    }
  }

  function applyJsonEdits() {
    const parsed = safeJsonParse(jsonText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError("The edited extraction must be a valid JSON object.");
      return null;
    }
    setError("");
    setExtracted({ ...emptyData, ...parsed });
    fillFields(parsed);
    return parsed;
  }

  async function saveQuestion() {
    const parsed = safeJsonParse(jsonText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError("The extracted JSON is not valid. Fix it or reload the question.");
      return;
    }
    const data = snapshotData({ ...parsed, question_text: extracted.question_text });
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await axios.post(`${API}/questions`, {
        title: title.trim() || data.dataset_title || "Untitled TQM question",
        extracted_data: data,
        original_filename: file?.name || null,
        image_base64: imageBase64 && imageMediaType ? `data:${imageMediaType};base64,${imageBase64}` : null
      });
      setSelectedId(response.data.id);
      setExtracted({ ...emptyData, ...data });
      setJsonText(pretty(data));
      setNotice("Question saved to your library.");
      await refreshQuestions();
    } catch (err) {
      setError(errorText(err, "Could not save this question."));
    } finally {
      setSaving(false);
    }
  }

  async function openSaved(id) {
    setError("");
    setNotice("");
    try {
      const { data: record } = await axios.get(`${API}/questions/${id}`);
      setSelectedId(id);
      setFile(null);
      setSavedImagePreview(record.image_base64 || "");
      setImageBase64(null);
      setImageMediaType(null);
      loadData(record.extracted_data, record.title, record.chart_type);
      setNotice("Saved question loaded.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errorText(err, "Could not open the saved question."));
    }
  }

  async function deleteSaved(id) {
    if (!window.confirm("Delete this saved question permanently?")) return;
    try {
      await axios.delete(`${API}/questions/${id}`);
      if (selectedId === id) newQuestion();
      await refreshQuestions();
      setNotice("Saved question deleted.");
    } catch (err) {
      setError(errorText(err, "Could not delete this question."));
    }
  }

  function changeType(value) {
    setChartType(value);
    clearResult();
  }

  async function requestInterpretation(spc, type) {
    setInterpreting(true);
    setInterpretError("");
    try {
      const res = await axios.post(`${API}/interpret`, {
        chart_type: type,
        question_text: extracted.question_text || "",
        spc
      });
      setInterpretation(res.data.interpretation);
    } catch (err) {
      setInterpretError(errorText(err, "The AI explanation is not available right now."));
    } finally {
      setInterpreting(false);
    }
  }

  async function generateChart() {
    setError("");
    setNotice("");
    if (!chartType) { setError("Choose a chart type first."); return; }
    const nNumber = nValue.trim() === "" ? NaN : Number(nValue);
    const body = {
      chart_type: chartType,
      question_text: extracted.question_text || "",
      values: parseNumbers(primary),
      secondary: parseNumbers(secondary),
      subgroups: parseRows(rawRows),
      n: Number.isFinite(nNumber) ? nNumber : null
    };
    if (!body.values.length && !body.subgroups.length) {
      setError("Enter the sample data first, or upload an image and click Extract question.");
      return;
    }
    setAnalyzing(true);
    clearResult();
    try {
      const res = await axios.post(`${API}/analyze`, body);
      setResult(res.data);
      setExplainTab("results");
      requestInterpretation(res.data, chartType);
    } catch (err) {
      setError(errorText(err, "Could not generate the chart."));
    } finally {
      setAnalyzing(false);
    }
  }

  function newQuestion() {
    setFile(null);
    setRotation(0);
    setSavedImagePreview("");
    setImageBase64(null);
    setImageMediaType(null);
    setExtracted(emptyData);
    setJsonText(pretty(emptyData));
    setSelectedId(null);
    setTitle("");
    setChartType("");
    setPrimary("");
    setSecondary("");
    setNValue("");
    setRawRows("");
    clearResult();
    setError("");
    setNotice("");
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  const shownImage = preview || savedImagePreview;
  const oddRotation = rotation % 180 !== 0;
  const inputs = info?.inputs;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Activity size={20} /></div>
          <div><strong>QualityLens</strong><span>Quality control workspace</span></div>
        </div>
        <nav>
          <button className="nav-item active"><ImagePlus size={17} /> Question to chart</button>
          <button className="nav-item" onClick={() => document.getElementById("saved-library")?.scrollIntoView({ behavior: "smooth" })}>
            <Database size={17} /> Saved questions <span className="nav-count">{savedQuestions.length}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="status-line"><span className={`status-dot ${health?.status === "ok" ? "online" : ""}`} /> Backend {health?.status === "ok" ? "connected" : "offline"}</div>
          <div className="status-line"><span className={`status-dot ${health?.api_key_configured ? "online" : ""}`} /> Claude {health?.api_key_configured ? "key found" : "key missing"}</div>
          <p className="sidebar-note">Always check extracted numbers against the original question.</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Total quality management</p>
            <h1>From question photo to control chart</h1>
            <p className="lede">Upload a problem, check the numbers Claude reads from it, pick the chart type, and get the chart with an explanation.</p>
          </div>
          <button className="button secondary" onClick={newQuestion}><Plus size={16} /> New question</button>
        </header>

        {error && <div className="alert error" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
        {notice && <div className="alert success"><Check size={18} /><span>{notice}</span></div>}

        <div className="grid-2">
          <section className="panel">
            <div className="panel-heading">
              <div className="heading-left"><span className="step">1</span><h2>Upload the question</h2></div>
              <span className="subtle-tag">JPG, PNG or WebP</span>
            </div>
            <div className={`upload-area ${shownImage ? "has-preview" : ""}`}>
              {shownImage ? (
                <>
                  <div className="preview-frame">
                    <img
                      src={shownImage} alt="Question preview" className="image-preview"
                      style={{
                        transform: `rotate(${rotation}deg)`,
                        maxWidth: oddRotation ? "250px" : "100%",
                        maxHeight: "250px"
                      }}
                    />
                  </div>
                  <div className="preview-actions">
                    <span className="file-name"><FileImage size={15} /> {file?.name || "Saved source image"}</span>
                    <span className="actions-right">
                      {file && <button className="text-button" onClick={() => setRotation((r) => (r + 90) % 360)}><RotateCw size={14} /> Rotate</button>}
                      <button className="text-button" onClick={() => { setFile(null); setSavedImagePreview(""); setImageBase64(null); setRotation(0); }}>Remove</button>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="upload-icon"><UploadCloud size={26} /></div>
                  <h3>Add a photo of the problem</h3>
                  <p>Use an upright, well-lit shot that includes the whole table.</p>
                  <div className="upload-buttons">
                    <button className="button primary" onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> Choose image</button>
                    <button className="button secondary" onClick={() => cameraInput.current?.click()}><Camera size={16} /> Take photo</button>
                  </div>
                </>
              )}
              <input ref={fileInput} className="hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleFile(e.target.files?.[0])} />
              <input ref={cameraInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
            <p className="helper-row"><ShieldCheck size={15} /> If the photo is sideways, rotate it before extracting.</p>
            <button className="button primary full-width" disabled={!file || loading} onClick={extractQuestion}>
              {loading ? <><LoaderCircle className="spin" size={17} /> Reading the image…</> : <><WandSparkles size={17} /> Extract question</>}
            </button>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div className="heading-left"><span className="step">2</span><h2>Check what was read</h2></div>
            </div>
            <label className="field">
              <span className="field-label">Title</span>
              <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Shaft diameter, 20 subgroups" />
            </label>
            <div className="field">
              <span className="field-label">Problem statement</span>
              <div className="question-box">
                {extracted.question_text || <span className="muted">The problem text Claude reads from your photo appears here.</span>}
              </div>
            </div>
            {warnings.length > 0 && (
              <div className="notice-box warn">
                <strong>Claude was unsure about:</strong>
                <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            <details className="raw-json">
              <summary>Edit raw extracted JSON</summary>
              <textarea className="json-editor" spellCheck="false" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
              <button className="button secondary small" onClick={applyJsonEdits}><Check size={15} /> Apply to data fields</button>
            </details>
            <button className="button secondary full-width" disabled={saving} onClick={saveQuestion}>
              {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save question
            </button>
          </section>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <div className="heading-left"><span className="step">3</span><h2>Choose the chart and confirm the data</h2></div>
          </div>

          <div className="chart-picker">
            <Field label="Chart type" hint={info ? info.dataType : "Not sure? Open the guide below."}>
              <select className="select" value={chartType} onChange={(e) => changeType(e.target.value)}>
                <option value="">Select a chart type…</option>
                {CHART_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {!chartType && detected && (
              <p className="detected">The image looks like a <strong>{CHART_INFO[detected].name}</strong> problem.{" "}
                <button className="text-button" onClick={() => changeType(detected)}>Use it</button>
              </p>
            )}
          </div>

          <details className="guide">
            <summary>Which chart should I pick?</summary>
            <table>
              <tbody>{CHART_GUIDE.map(([a, b]) => <tr key={a}><td>{a}</td><td><strong>{b}</strong></td></tr>)}</tbody>
            </table>
          </details>

          {inputs ? (
            <div className="data-grid">
              <Field label={inputs.primary} hint={inputs.primaryHint} count={`${parseNumbers(primary).length} values`}>
                <textarea className="values-input" rows={3} value={primary} placeholder={inputs.primaryPlaceholder} onChange={(e) => setPrimary(e.target.value)} />
              </Field>
              {inputs.secondary && (
                <Field label={inputs.secondary} hint={inputs.secondaryHint} count={`${parseNumbers(secondary).length} values`}>
                  <textarea className="values-input" rows={3} value={secondary} placeholder={inputs.secondaryPlaceholder} onChange={(e) => setSecondary(e.target.value)} />
                </Field>
              )}
              {inputs.n && (
                <Field label={inputs.n}>
                  <input className="text-input narrow" inputMode="decimal" value={nValue} placeholder={inputs.nPlaceholder} onChange={(e) => setNValue(e.target.value)} />
                </Field>
              )}
              {inputs.raw && (
                <Field wide label="Or paste raw measurements, one subgroup per line" hint="If this box has data it is used instead of the means and ranges. The subgroup size comes from the line length.">
                  <textarea className="values-input" rows={4} value={rawRows} placeholder={"5.1, 5.3, 5.0, 5.2, 5.4\n5.2, 5.4, 5.1, 5.0, 5.3"} onChange={(e) => setRawRows(e.target.value)} />
                </Field>
              )}
            </div>
          ) : (
            <p className="muted pad">Pick a chart type to see the data it needs.</p>
          )}

          <button className="button primary generate" disabled={!chartType || analyzing} onClick={generateChart}>
            {analyzing ? <><LoaderCircle className="spin" size={17} /> Calculating…</> : <><Activity size={17} /> Generate chart</>}
          </button>
        </section>

        {result && (
          <section className="panel" ref={resultRef}>
            <div className="panel-heading">
              <div className="heading-left"><span className="step">4</span><h2>{result.label}</h2></div>
              <span className={`verdict ${totalOut ? "bad" : "good"}`}>
                {totalOut ? `${totalOut} point${totalOut > 1 ? "s" : ""} out of control` : "In statistical control"}
              </span>
            </div>

            <dl className="summary-strip">
              {result.summary.map((s) => (
                <div key={s.label}><dt>{s.label}</dt><dd>{typeof s.value === "number" ? fmt(s.value) : s.value}</dd></div>
              ))}
            </dl>

            {result.charts.map((c) => <ControlChart key={c.name} chart={c} />)}
            <p className="legend-note">Red points fall outside the control limits. The shaded band marks the area between the limits.</p>

            {(result.warnings.length > 0 || result.patterns.length > 0 || totalOut > 0) && (
              <div className="notice-box warn">
                <strong>Signals to look at</strong>
                <ul>
                  {result.charts.flatMap((c) => c.out_of_control.map((s) => (
                    <li key={`${c.name}-${s.index}`}>
                      {c.name}: sample {s.index} ({fmt(s.value)}) is {s.side === "above_UCL" ? "above the UCL" : "below the LCL"}.
                    </li>
                  )))}
                  {result.patterns.map((p) => <li key={p}>{p}</li>)}
                  {result.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            <div className="tabs" role="tablist">
              {[["results", "Your result"], ["about", "About this chart"], ["benefits", "Benefits and applications"]].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={explainTab === id} className={`tab ${explainTab === id ? "active" : ""}`} onClick={() => setExplainTab(id)}>{label}</button>
              ))}
            </div>

            <div className="tab-panel">
              {explainTab === "results" && (
                <>
                  {interpreting && <p className="muted"><LoaderCircle className="spin inline" size={15} /> Writing the explanation…</p>}
                  {interpretation && <div className="prose"><Prose text={interpretation} /></div>}
                  {interpretError && (
                    <div className="notice-box warn">
                      <span>{interpretError}</span>
                      <button className="button secondary small" onClick={() => requestInterpretation(result, chartType)}>Try again</button>
                    </div>
                  )}
                  {info && (
                    <>
                      <h3>How to read this chart</h3>
                      <BulletList items={info.reading} />
                    </>
                  )}
                  <p className="caveat"><AlertCircle size={15} /> {result.note} A stable process can still miss its specification limits.</p>
                </>
              )}

              {explainTab === "about" && info && (
                <>
                  <p className="lead">{info.summary}</p>
                  <h3>Use it when</h3>
                  <BulletList items={info.whenToUse} />
                  <h3>Formulas</h3>
                  <div className="formulas">{info.formulas.map((f) => <code key={f}>{f}</code>)}</div>
                </>
              )}

              {explainTab === "benefits" && info && (
                <div className="two-col">
                  <div>
                    <h3>Benefits of the {info.name}</h3>
                    <BulletList items={info.benefits} />
                    <h3>Where the {info.name} is used</h3>
                    <BulletList items={info.applications} />
                  </div>
                  <div>
                    <h3>Benefits of control charts in general</h3>
                    <BulletList items={GENERAL_BENEFITS} />
                    <h3>Applications in general</h3>
                    <BulletList items={GENERAL_APPLICATIONS} />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="panel" id="saved-library">
          <div className="panel-heading">
            <div className="heading-left"><Database size={18} /><h2>Saved questions</h2></div>
            <button className="icon-button" onClick={refreshQuestions} title="Refresh saved questions" aria-label="Refresh saved questions"><RefreshCw size={16} /></button>
          </div>
          {savedQuestions.length === 0 ? (
            <div className="empty-library"><Database size={24} /><strong>Nothing saved yet</strong><span>Extract a question and press Save question to keep it here.</span></div>
          ) : (
            <div className="saved-list">
              {savedQuestions.map((q) => (
                <div className={`saved-row ${selectedId === q.id ? "selected" : ""}`} key={q.id}>
                  <button className="saved-main" onClick={() => openSaved(q.id)}>
                    <span className="saved-file-icon"><FileText size={18} /></span>
                    <span className="saved-copy">
                      <strong>{q.title}</strong>
                      <span className="saved-meta">{q.chart_type && q.chart_type !== "auto" ? q.chart_type : q.problem_type || "unknown"}, saved {new Date(q.created_at).toLocaleString()}</span>
                      <span className="saved-text">{q.question_text || "No question text extracted."}</span>
                    </span>
                    <ChevronRight size={17} className="saved-chevron" />
                  </button>
                  <button className="delete-button" title="Delete saved question" aria-label="Delete saved question" onClick={() => deleteSaved(q.id)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer>
          <span>QualityLens AI, a TQM project prototype</span>
          <span>Verify source values before relying on AI output <ArrowUpRight size={13} /></span>
        </footer>
      </main>
    </div>
  );
}
