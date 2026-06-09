"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/database";

const BASE_STAGES = [
  { key:"spec",label:"仕様書",short:"仕様",group:"prep" },
  { key:"pattern_up",label:"パターンUP",short:"パタ",group:"prep" },
  { key:"order_material",label:"資材発注",short:"資材",group:"order" },
  { key:"order_tag",label:"下げ札発注",short:"下札",group:"order" },
  { key:"arrival",label:"資材到着",short:"到着",group:"prod" },
  { key:"input",label:"投入",short:"投入",group:"prod" },
  { key:"sample",label:"先あげ",short:"先上",group:"prod" },
  { key:"pre",label:"納前",short:"納前",group:"prod" },
];
const SEC_STAGES = [
  { key:"sec_input",label:"二次加工投入",short:"2次投",group:"sec" },
  { key:"sec_sample",label:"二次加工先あげ",short:"2次上",group:"sec" },
];
const DELIVERY = { key:"delivered",label:"納品完了",short:"納完",group:"delivery" };
const ROLES = ["デザイナー","生産管理","パタンナー","MD","その他"];
const ROLE_COLORS = {"デザイナー":"#7a6ad8","生産管理":"#c47a3a","パタンナー":"#4a9d8a","MD":"#c45a7a","その他":"#8a8a8a"};

function getStageList(hasSec) {
  const s = [...BASE_STAGES];
  if (hasSec) s.push(...SEC_STAGES);
  s.push(DELIVERY);
  return s;
}

function calcPct(stagesMap, hasSec) {
  const keys = getStageList(hasSec).map(s => s.key);
  const total = keys.length;
  const done = keys.filter(k => stagesMap[k]).length;
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function statusCol(p) { if(p===100) return "#2a9d6a"; if(p>=66) return "#d4a843"; if(p>=33) return "#c47a3a"; return "#8a8a8a"; }
function fmtTime(iso) { const d=new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function fmtDate(dateStr) { if(!dateStr) return ""; const d=new Date(dateStr+"T00:00:00"); return `${d.getMonth()+1}/${d.getDate()}`; }
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr+"T00:00:00");
  return Math.round((target - today) / 86400000);
}
function getUserColor(user) { return ROLE_COLORS[user?.role] || "#8a8a8a"; }
function findMaster(code, list) { return list.find(m => m.code.toLowerCase() === (code||"").toLowerCase()); }
function totalQty(csq) { return (csq||[]).reduce((s,r) => s + (r.qty||0), 0); }

const IS = "w-full px-2.5 py-1.5 rounded border-[1.5px] border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm outline-none";
const LS = "block text-[10px] text-[var(--text-secondary)] mb-0.5 font-mono uppercase tracking-wider";

// ── Deadline Badge ──
function DeadlineBadge({ deliveryDate, isDelivered, size = "sm" }) {
  if (!deliveryDate) return null;
  const days = daysUntil(deliveryDate);
  let bg = "var(--bg-tertiary)", color = "var(--text-secondary)", label = `納期 ${fmtDate(deliveryDate)}`;
  if (isDelivered) { bg = "rgba(42,157,106,0.12)"; color = "#2a9d6a"; }
  else if (days < 0) { bg = "rgba(196,90,90,0.18)"; color = "#e06c6c"; label = `納期超過 ${Math.abs(days)}日`; }
  else if (days === 0) { bg = "rgba(196,90,90,0.18)"; color = "#e06c6c"; label = "納期 本日"; }
  else if (days <= 3) { bg = "rgba(196,90,90,0.15)"; color = "#e06c6c"; label = `納期 ${fmtDate(deliveryDate)} (あと${days}日)`; }
  else if (days <= 7) { bg = "rgba(212,168,67,0.15)"; color = "#d4a843"; label = `納期 ${fmtDate(deliveryDate)} (あと${days}日)`; }
  const pad = size === "lg" ? "3px 10px" : "1px 6px";
  const fs = size === "lg" ? 12 : 10;
  return <span className="rounded font-mono font-semibold whitespace-nowrap" style={{ background: bg, color, padding: pad, fontSize: fs }}>{label}</span>;
}

// ── Login Screen ──
function LoginScreen({ users, onLogin, onRegister }) {
  const [mode, setMode] = useState(users.length > 0 ? "select" : "register");
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);

  if (mode === "register") return (
    <div className="flex items-center justify-center min-h-screen p-5">
      <div className="w-[360px] max-w-[90vw]">
        <h1 className="font-mono text-[22px] mb-1.5 tracking-tight">量産進捗</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-7">ユーザー登録</p>
        <div className="flex flex-col gap-3.5">
          <div><label className={LS}>名前 *</label><input className={IS} value={name} onChange={e=>setName(e.target.value)} placeholder="例: 田中" /></div>
          <div><label className={LS}>職種</label>
            <div className="flex gap-1.5 flex-wrap">
              {ROLES.map(r => (
                <button key={r} onClick={() => setRole(r)} className="px-3.5 py-1.5 rounded text-xs font-mono cursor-pointer transition-all" style={{ border: `1.5px solid ${role===r ? ROLE_COLORS[r] : "var(--border)"}`, background: role===r ? `${ROLE_COLORS[r]}15` : "transparent", color: role===r ? ROLE_COLORS[r] : "var(--text-secondary)" }}>{r}</button>
              ))}
            </div>
          </div>
          <button onClick={() => { if(!name.trim()) return; onRegister({ name: name.trim(), role }); }} className="mt-2 py-2.5 rounded bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-semibold cursor-pointer border-none">登録してはじめる</button>
          {users.length > 0 && <button onClick={() => setMode("select")} className="py-2 rounded border border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-sm cursor-pointer">既存ユーザーでログイン</button>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen p-5">
      <div className="w-[360px] max-w-[90vw]">
        <h1 className="font-mono text-[22px] mb-1.5 tracking-tight">量産進捗</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-7">ログイン</p>
        <div className="flex flex-col gap-1.5">
          {users.map(u => (
            <button key={u.id} onClick={() => onLogin(u)} className="flex items-center gap-3 p-3 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] cursor-pointer text-left transition-colors hover:bg-[var(--hover)]">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold font-mono text-white shrink-0" style={{ background: getUserColor(u) }}>{u.name.slice(0,1)}</span>
              <div>
                <div className="text-sm font-medium">{u.name}</div>
                <div className="text-xs font-mono" style={{ color: getUserColor(u) }}>{u.role}</div>
              </div>
            </button>
          ))}
        </div>
        <button onClick={() => setMode("register")} className="mt-3.5 w-full py-2.5 rounded border border-dashed border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-sm cursor-pointer font-mono">+ 新規ユーザー登録</button>
      </div>
    </div>
  );
}

// ── Code Input ──
function CodeInput({ value, onChange, master, placeholder, accentColor }) {
  const resolved = findMaster(value, master);
  return (
    <div className="relative">
      <input className={`${IS} font-mono pr-20`} style={{ color: accentColor }} value={value} onChange={e => onChange(e.target.value.toUpperCase())} placeholder={placeholder} />
      {value && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none max-w-[70px] overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: resolved ? "var(--text-primary)" : "#c45a5a" }}>{resolved ? resolved.name : "?"}</span>}
    </div>
  );
}

// ── CSQ Table ──
function CSQTable({ data, colors, sizes }) {
  if (!data?.length) return null;
  const total = data.reduce((s, r) => s + (r.qty || 0), 0);
  return (
    <div className="border border-[var(--border)] rounded overflow-hidden text-xs font-mono">
      <div className="grid grid-cols-[60px_1fr_60px_1fr_70px] bg-[var(--bg-tertiary)]">
        {["色番","カラー","サイズ","サイズ名","数量"].map(h => <div key={h} className="px-2 py-1 text-[9px] text-[var(--text-secondary)] uppercase">{h}</div>)}
      </div>
      {data.map((r, i) => { const c = findMaster(r.color_code||r.colorCode, colors); const s = findMaster(r.size_code||r.sizeCode, sizes); return (
        <div key={i} className="grid grid-cols-[60px_1fr_60px_1fr_70px] border-t border-[var(--border)]">
          <div className="px-2 py-1 text-[#d4a843]">{r.color_code||r.colorCode}</div>
          <div className="px-2 py-1">{c?.name || "—"}</div>
          <div className="px-2 py-1 text-[#6b8ec4]">{r.size_code||r.sizeCode}</div>
          <div className="px-2 py-1">{s?.name || "—"}</div>
          <div className="px-2 py-1 text-right">{r.qty || 0}</div>
        </div>
      ); })}
      <div className="grid grid-cols-[1fr_70px] border-t-2 border-[var(--text-secondary)]">
        <div className="px-2 py-1 font-semibold text-[var(--text-secondary)]">合計</div>
        <div className="px-2 py-1 text-right font-semibold">{total}</div>
      </div>
    </div>
  );
}

// ── CSQ Edit ──
function CSQEdit({ data, onChange, colors, sizes }) {
  const add = () => onChange([...data, { colorCode: "", sizeCode: "", qty: 0 }]);
  const rm = i => onChange(data.filter((_, j) => j !== i));
  const upd = (i, k, v) => onChange(data.map((c, j) => j === i ? { ...c, [k]: v } : c));
  return (
    <div>
      <label className={LS}>カラー・サイズ / 数量 <span className="normal-case tracking-normal text-[9px]">(番号入力→自動変換)</span></label>
      <div className="flex flex-col gap-1.5">
        {data.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_70px_24px] gap-1.5 items-center">
            <CodeInput value={r.colorCode||""} onChange={v => upd(i, "colorCode", v)} master={colors} placeholder="色番" accentColor="#d4a843" />
            <CodeInput value={r.sizeCode||""} onChange={v => upd(i, "sizeCode", v)} master={sizes} placeholder="サイズ" accentColor="#6b8ec4" />
            <input className={`${IS} text-right text-xs`} type="number" value={r.qty||""} onChange={e => upd(i, "qty", Number(e.target.value)||0)} placeholder="数量" />
            <button onClick={() => rm(i)} className="bg-transparent border-none text-[var(--text-secondary)] cursor-pointer text-base">×</button>
          </div>
        ))}
        <button onClick={add} className="py-1 border border-dashed border-[var(--border)] rounded bg-transparent text-[var(--text-secondary)] text-xs cursor-pointer font-mono">+ 行追加</button>
      </div>
    </div>
  );
}

// ── Chip ──
function Chip({ stage, checked, onToggle }) {
  const isSec = stage.group === "sec"; const isDel = stage.group === "delivery";
  const col = isDel ? (checked ? "#2a9d6a" : "#d4a843") : isSec ? "#6b8ec4" : "#2a9d6a";
  return (
    <button onClick={onToggle} className="inline-flex items-center gap-1 rounded cursor-pointer transition-all whitespace-nowrap font-mono" style={{ padding: isDel ? "5px 14px" : "4px 10px", border: `1.5px solid ${checked ? col : "var(--border)"}`, background: checked ? (isDel ? "rgba(42,157,106,0.15)" : isSec ? "rgba(107,142,196,0.1)" : "rgba(42,157,106,0.08)") : "transparent", color: checked ? col : "var(--text-secondary)", fontSize: isDel ? 13 : 12, fontWeight: isDel ? 600 : 400 }}>
      <span style={{ fontSize: isDel ? 14 : 12 }}>{checked ? "✓" : "○"}</span>{stage.label}
    </button>
  );
}

function Bar({ p }) {
  return <div className="w-full h-1.5 rounded-full bg-[var(--track-bg)] overflow-hidden"><div className="h-full rounded-full transition-all duration-400" style={{ width: `${p}%`, background: statusCol(p) }} /></div>;
}

// ── Item Form Modal ──
function ItemFormModal({ item, onSave, onClose, colors, sizes, title }) {
  const isEdit = !!item;
  const [f, sF] = useState(isEdit ? {
    styleNo: item.style_no, name: item.name, season: item.season||"", factory: item.factory||"",
    unitPrice: item.unit_price||"", patterner: item.patterner||"", supplier: item.supplier||"",
    notes: item.notes||"", hasSecondary: item.has_secondary||false,
    secName: item.secondary_name||"", secAddress: item.secondary_address||"", secPhone: item.secondary_phone||"",
    deliveryDate: item.delivery_date||""
  } : { styleNo:"",name:"",season:"26AW",factory:"",unitPrice:"",patterner:"",supplier:"",notes:"",hasSecondary:false,secName:"",secAddress:"",secPhone:"",deliveryDate:"" });
  const [cq, setCq] = useState([{ colorCode: "", sizeCode: "", qty: 0 }]);
  const u = (k, v) => sF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (isEdit && item.id) {
      db.getItemColorSizes(item.id).then(rows => {
        if (rows.length > 0) setCq(rows.map(r => ({ colorCode: r.color_code, sizeCode: r.size_code, qty: r.qty })));
      });
    }
  }, [isEdit, item?.id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1001]" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[var(--bg-primary)] rounded-lg p-7 w-[500px] max-w-[94vw] max-h-[90vh] overflow-y-auto border border-[var(--border)]">
        <h3 className="mb-4 text-[15px] font-mono">{title}</h3>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5"><div><label className={LS}>品番 *</label><input className={IS} value={f.styleNo} onChange={e=>u("styleNo",e.target.value)} placeholder="TN-26AW-XX" /></div><div><label className={LS}>シーズン</label><input className={IS} value={f.season} onChange={e=>u("season",e.target.value)} /></div></div>
          <div><label className={LS}>品名 *</label><input className={IS} value={f.name} onChange={e=>u("name",e.target.value)} /></div>
          <div><label className={LS}>📅 納期</label><input className={IS} type="date" value={f.deliveryDate} onChange={e=>u("deliveryDate",e.target.value)} /></div>
          <CSQEdit data={cq} onChange={setCq} colors={colors} sizes={sizes} />
          <div className="grid grid-cols-2 gap-2.5"><div><label className={LS}>工場</label><input className={IS} value={f.factory} onChange={e=>u("factory",e.target.value)} /></div><div><label className={LS}>工場単価</label><input className={IS} value={f.unitPrice} onChange={e=>u("unitPrice",e.target.value)} placeholder="¥0,000" /></div></div>
          <div className="grid grid-cols-2 gap-2.5"><div><label className={LS}>パタンナー</label><input className={IS} value={f.patterner} onChange={e=>u("patterner",e.target.value)} /></div><div><label className={LS}>主要表地・糸 仕入先</label><input className={IS} value={f.supplier} onChange={e=>u("supplier",e.target.value)} /></div></div>
          <div className="p-3 rounded-md transition-all" style={{ border: `1.5px solid ${f.hasSecondary ? "#6b8ec4" : "var(--border)"}`, background: f.hasSecondary ? "rgba(107,142,196,0.05)" : "transparent" }}>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.hasSecondary} onChange={e => u("hasSecondary", e.target.checked)} style={{ accentColor: "#6b8ec4" }} /><span className="font-mono text-xs">二次加工あり</span></label>
            {f.hasSecondary && <div className="flex flex-col gap-2.5 mt-3"><div><label className={LS}>二次加工先名</label><input className={IS} value={f.secName} onChange={e=>u("secName",e.target.value)} /></div><div><label className={LS}>住所</label><input className={IS} value={f.secAddress} onChange={e=>u("secAddress",e.target.value)} /></div><div><label className={LS}>電話番号</label><input className={IS} value={f.secPhone} onChange={e=>u("secPhone",e.target.value)} /></div></div>}
          </div>
          <div><label className={LS}>メモ</label><textarea className={`${IS} min-h-[50px] resize-y`} value={f.notes} onChange={e=>u("notes",e.target.value)} /></div>
        </div>
        <div className="flex gap-2.5 mt-4 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded border border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-sm cursor-pointer">キャンセル</button>
          <button onClick={() => { if(!f.styleNo||!f.name) return; onSave(f, cq.filter(c => c.colorCode || c.sizeCode)); }} className="px-5 py-2 rounded border-none bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-semibold cursor-pointer">{isEdit ? "保存" : "追加"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Chat Panel ──
function ChatPanel({ itemId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    db.getChatMessages(itemId).then(setMessages);
    const channel = supabase.channel(`chat-${itemId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `item_id=eq.${itemId}` }, () => {
      db.getChatMessages(itemId).then(setMessages);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async () => {
    const t = msg.trim(); if (!t) return;
    await db.sendChatMessage(itemId, currentUser.id, t);
    await db.addLog({ item_id: itemId, user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role, message: "💬 メッセージ送信" });
    setMsg("");
  };

  return (
    <div className="border-t border-[var(--border)] mt-4 pt-3">
      <div className="text-[10px] text-[var(--text-secondary)] font-mono uppercase tracking-wider mb-2">チャット</div>
      <div className="max-h-[200px] overflow-y-auto mb-2.5 flex flex-col gap-1.5 pr-1">
        {messages.length === 0 && <div className="text-xs text-[var(--text-secondary)] py-2.5 text-center">メッセージはまだありません</div>}
        {messages.map((m, i) => {
          const isMe = m.user_id === currentUser.id;
          const col = ROLE_COLORS[m.users?.role] || "#8a8a8a";
          return (
            <div key={i} className="flex gap-2" style={{ flexDirection: isMe ? "row-reverse" : "row" }}>
              <span className="shrink-0 w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-bold font-mono text-white" style={{ background: col }}>{m.users?.name?.slice(0,1) || "?"}</span>
              <div className="max-w-[75%]">
                {!isMe && <div className="text-[10px] font-mono mb-0.5" style={{ color: col }}>{m.users?.name} ({m.users?.role})</div>}
                <div className="px-3 py-2 text-sm leading-relaxed" style={{ borderRadius: 10, borderTopLeftRadius: isMe ? 10 : 2, borderTopRightRadius: isMe ? 2 : 10, background: `${col}18` }}>
                  <div>{m.message}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 font-mono" style={{ textAlign: isMe ? "right" : "left" }}>{fmtTime(m.created_at)}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex gap-1.5">
        <input className={`${IS} flex-1`} value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}} placeholder={`${currentUser.name} として送信...`} />
        <button onClick={send} className="px-3.5 py-2 rounded border-none text-white text-xs font-semibold cursor-pointer font-mono shrink-0" style={{ background: getUserColor(currentUser) }}>送信</button>
      </div>
    </div>
  );
}

// ── Detail Modal ──
function DetailModal({ item, stagesMap, colorSizes, onClose, currentUser, colors, sizes, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const imgRef = useRef(null);
  const stageList = getStageList(item.has_secondary);
  const p = calcPct(stagesMap, item.has_secondary);
  const isDelivered = stagesMap["delivered"];
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { db.getItemFiles(item.id).then(setFiles); }, [item.id]);

  const toggle = async (key) => {
    const newVal = !stagesMap[key];
    await db.upsertStage(item.id, key, newVal, currentUser.id);
    const lab = stageList.find(s => s.key === key)?.label || key;
    await db.addLog({ item_id: item.id, user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role, message: `${item.style_no} — ${lab} ${newVal ? "✓" : "✗"}` });
    onRefresh();
  };

  const handleEditSave = async (f, cq) => {
    await db.updateItem(item.id, { style_no: f.styleNo, name: f.name, season: f.season, factory: f.factory, unit_price: f.unitPrice, patterner: f.patterner, supplier: f.supplier, has_secondary: f.hasSecondary, secondary_name: f.secName, secondary_address: f.secAddress, secondary_phone: f.secPhone, notes: f.notes, delivery_date: f.deliveryDate || null });
    await db.setItemColorSizes(item.id, cq.map(r => ({ color_code: r.colorCode, size_code: r.sizeCode, qty: r.qty })));
    if (f.hasSecondary && !item.has_secondary) {
      await db.upsertStage(item.id, "sec_input", false, currentUser.id);
      await db.upsertStage(item.id, "sec_sample", false, currentUser.id);
    }
    await db.addLog({ item_id: item.id, user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role, message: `${item.style_no} — 情報を編集` });
    setEditing(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!confirm(`「${item.style_no} ${item.name}」を削除しますか？\nこの操作は取り消せません。チャット・ファイル・進捗もすべて削除されます。`)) return;
    await db.addLog({ item_id: null, user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role, message: `${item.style_no} ${item.name} を削除` });
    await supabase.from("items").delete().eq("id", item.id);
    onClose();
    onRefresh();
  };

  const handleImg = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    await db.uploadItemImage(item.id, f);
    onRefresh();
    e.target.value = "";
  };

  const handleFileUpload = async (e) => {
    const f = e.target.files; if (!f?.length) return;
    for (const file of f) { await db.uploadFile(item.id, file, currentUser.id); }
    db.getItemFiles(item.id).then(setFiles);
    e.target.value = "";
  };

  const groups = { prep: stageList.filter(s=>s.group==="prep"), order: stageList.filter(s=>s.group==="order"), prod: stageList.filter(s=>s.group==="prod"), sec: stageList.filter(s=>s.group==="sec"), delivery: stageList.filter(s=>s.group==="delivery") };

  return (<>
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[var(--bg-primary)] rounded-lg p-5 sm:p-7 w-[580px] max-w-[94vw] max-h-[92vh] overflow-y-auto border border-[var(--border)]">
        <div className="flex gap-4 mb-4">
          <div onClick={() => imgRef.current?.click()} className="w-[90px] h-[90px] sm:w-[120px] sm:h-[120px] rounded-md bg-[var(--bg-tertiary)] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer border-[1.5px] border-dashed border-[var(--border)]" title="画像を変更">
            {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <div className="flex flex-col items-center gap-1"><span className="text-[28px] opacity-30">📷</span><span className="font-mono text-[9px] text-[var(--text-secondary)] opacity-60">画像を追加</span></div>}
            <input ref={imgRef} type="file" accept="image/*" onChange={handleImg} className="hidden" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-mono text-sm text-[var(--text-secondary)] mb-1 flex items-center gap-2 flex-wrap">
                  {item.style_no}
                  {isDelivered && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(42,157,106,0.15)] text-[#2a9d6a] font-semibold">納品完了</span>}
                </div>
                <h3 className="text-lg font-medium">{item.name}</h3>
                <div className="mt-1.5"><DeadlineBadge deliveryDate={item.delivery_date} isDelivered={isDelivered} size="lg" /></div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setEditing(true)} className="bg-transparent border border-[var(--border)] rounded px-2.5 py-1 text-[var(--text-secondary)] text-[11px] cursor-pointer font-mono">✎ 編集</button>
                <button onClick={onClose} className="bg-transparent border-none text-xl text-[var(--text-secondary)] cursor-pointer">×</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 mt-2.5 text-xs text-[var(--text-secondary)] font-mono">
              {item.factory && <span>工場: {item.factory}</span>}
              {item.unit_price && <span>単価: {item.unit_price}</span>}
              {item.patterner && <span>パタンナー: {item.patterner}</span>}
              {item.supplier && <span>仕入先: {item.supplier}</span>}
            </div>
          </div>
        </div>

        {colorSizes?.length > 0 && <div className="mb-3.5"><CSQTable data={colorSizes} colors={colors} sizes={sizes} /></div>}

        {item.has_secondary && item.secondary_name && (
          <div className="p-2.5 rounded-[5px] mb-3.5 border-[1.5px] border-[#6b8ec4] bg-[rgba(107,142,196,0.06)]">
            <div className="font-mono text-[10px] text-[#6b8ec4] uppercase tracking-wider mb-1.5">二次加工先</div>
            <div className="text-sm font-medium mb-0.5">{item.secondary_name}</div>
            {item.secondary_address && <div className="text-xs text-[var(--text-secondary)] mb-0.5">〒 {item.secondary_address}</div>}
            {item.secondary_phone && <div className="text-xs text-[var(--text-secondary)]">☎ {item.secondary_phone}</div>}
          </div>
        )}

        <div className="flex items-center gap-2.5 mb-1.5"><Bar p={p} /><span className="font-mono text-sm font-semibold shrink-0" style={{ color: statusCol(p) }}>{p}%</span></div>

        <div className="mt-3.5 mb-2">
          <div className="flex flex-wrap gap-1.5 mb-1.5">{groups.prep.map(s => <Chip key={s.key} stage={s} checked={stagesMap[s.key]} onToggle={() => toggle(s.key)} />)}{groups.order.map(s => <Chip key={s.key} stage={s} checked={stagesMap[s.key]} onToggle={() => toggle(s.key)} />)}</div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">{groups.prod.map(s => <Chip key={s.key} stage={s} checked={stagesMap[s.key]} onToggle={() => toggle(s.key)} />)}</div>
          {groups.sec.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1.5 mb-1.5 border-t border-dashed border-[rgba(107,142,196,0.3)]">{groups.sec.map(s => <Chip key={s.key} stage={s} checked={stagesMap[s.key]} onToggle={() => toggle(s.key)} />)}</div>}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t-2 border-[var(--border)]">{groups.delivery.map(s => <Chip key={s.key} stage={s} checked={stagesMap[s.key]} onToggle={() => toggle(s.key)} />)}</div>
        </div>

        {item.notes && <div className="p-2.5 rounded bg-[var(--bg-secondary)] text-sm text-[var(--text-secondary)] mt-2.5"><span className="font-mono text-[10px] uppercase tracking-wider">memo</span><div className="mt-1 whitespace-pre-wrap">{item.notes}</div></div>}

        <div className="mt-3.5">
          <div className="flex items-center gap-2 mb-2">
            <span className={`${LS} !mb-0`}>添付ファイル</span>
            <button onClick={() => fileRef.current?.click()} className="px-2.5 py-0.5 rounded border border-dashed border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer font-mono">+ アップロード</button>
            <input ref={fileRef} type="file" accept=".pdf,image/*" multiple onChange={handleFileUpload} className="hidden" />
          </div>
          {files.length > 0 && <div className="flex flex-col gap-1">{files.map(f => (
            <div key={f.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border)]">
              <span className="text-sm">{f.file_type?.includes("pdf") ? "📄" : "🖼️"}</span>
              <button onClick={() => setPreview(f)} className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-xs cursor-pointer text-left p-0 overflow-hidden text-ellipsis whitespace-nowrap">{f.file_name}</button>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono shrink-0">{(f.file_size/1024).toFixed(0)}KB</span>
              <button onClick={async () => { await db.deleteFile(f.id, f.file_url); db.getItemFiles(item.id).then(setFiles); }} className="bg-transparent border-none text-[var(--text-secondary)] cursor-pointer text-sm p-0">×</button>
            </div>
          ))}</div>}
        </div>

        <ChatPanel itemId={item.id} currentUser={currentUser} />

        {/* Danger zone */}
        <div className="mt-5 pt-3 border-t border-[var(--border)] flex justify-end">
          <button onClick={handleDelete} className="px-3 py-1.5 rounded border border-[rgba(196,90,90,0.4)] bg-transparent text-[#c45a5a] text-[11px] cursor-pointer font-mono hover:bg-[rgba(196,90,90,0.08)]">🗑 このアイテムを削除</button>
        </div>
      </div>
    </div>

    {preview && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1100]" onClick={() => setPreview(null)}>
        <div onClick={e => e.stopPropagation()} className="bg-[var(--bg-primary)] rounded-lg p-4 w-[90vw] max-w-[800px] max-h-[90vh] flex flex-col border border-[var(--border)]">
          <div className="flex justify-between items-center mb-3"><span className="font-mono text-sm">{preview.file_name}</span><button onClick={() => setPreview(null)} className="bg-transparent border-none text-xl text-[var(--text-secondary)] cursor-pointer">×</button></div>
          <div className="flex-1 overflow-auto rounded bg-white min-h-[400px]">
            {preview.file_type?.includes("pdf") ? <iframe src={preview.file_url} className="w-full h-[70vh] border-none" /> : <img src={preview.file_url} alt="" className="w-full object-contain" />}
          </div>
        </div>
      </div>
    )}

    {editing && <ItemFormModal item={item} onSave={handleEditSave} onClose={() => setEditing(false)} colors={colors} sizes={sizes} title="✎ アイテム編集" />}
  </>);
}

// ── Masters Editor ──
function MastersEditor({ colors: initC, sizes: initS, onSave, onClose }) {
  const [colors, setColors] = useState([...initC]);
  const [sizes, setSizes] = useState([...initS]);
  return (<>
    <h3 className="mb-4 text-[15px] font-mono">マスター設定</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div>
        <label className={`${LS} !mb-2 !text-[11px]`}>色番マスター</label>
        <div className="flex flex-col gap-1">{colors.map((c, i) => (
          <div key={i} className="grid grid-cols-[55px_1fr_20px] gap-1 items-center">
            <input className={`${IS} !p-1 !text-[11px] text-center text-[#d4a843]`} value={c.code} onChange={e => setColors(p => p.map((x,j) => j===i ? {...x, code:e.target.value} : x))} />
            <input className={`${IS} !p-1 !text-[11px]`} value={c.name} onChange={e => setColors(p => p.map((x,j) => j===i ? {...x, name:e.target.value} : x))} placeholder="色名" />
            <button onClick={() => setColors(p => p.filter((_,j) => j!==i))} className="bg-transparent border-none text-[var(--text-secondary)] cursor-pointer text-sm p-0">×</button>
          </div>
        ))}<button onClick={() => setColors(p => [...p, {code:`C${(p.length+1).toString().padStart(2,"0")}`,name:""}])} className="py-1 border border-dashed border-[var(--border)] rounded-[3px] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer">+</button></div>
      </div>
      <div>
        <label className={`${LS} !mb-2 !text-[11px]`}>サイズ番マスター</label>
        <div className="flex flex-col gap-1">{sizes.map((s, i) => (
          <div key={i} className="grid grid-cols-[55px_1fr_20px] gap-1 items-center">
            <input className={`${IS} !p-1 !text-[11px] text-center text-[#6b8ec4]`} value={s.code} onChange={e => setSizes(p => p.map((x,j) => j===i ? {...x, code:e.target.value} : x))} />
            <input className={`${IS} !p-1 !text-[11px]`} value={s.name} onChange={e => setSizes(p => p.map((x,j) => j===i ? {...x, name:e.target.value} : x))} placeholder="サイズ名" />
            <button onClick={() => setSizes(p => p.filter((_,j) => j!==i))} className="bg-transparent border-none text-[var(--text-secondary)] cursor-pointer text-sm p-0">×</button>
          </div>
        ))}<button onClick={() => setSizes(p => [...p, {code:`S${(p.length+1).toString().padStart(2,"0")}`,name:""}])} className="py-1 border border-dashed border-[var(--border)] rounded-[3px] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer">+</button></div>
      </div>
    </div>
    <div className="flex gap-2.5 mt-5 justify-end">
      <button onClick={onClose} className="px-4 py-2 rounded border border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-sm cursor-pointer">キャンセル</button>
      <button onClick={() => onSave(colors, sizes)} className="px-5 py-2 rounded border-none bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-semibold cursor-pointer">保存</button>
    </div>
  </>);
}

// ── Main App ──
export default function App() {
  const [items, setItems] = useState([]);
  const [allStages, setAllStages] = useState({});
  const [allCS, setAllCS] = useState({});
  const [logs, setLogs] = useState([]);
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCU] = useState(null);
  const [selId, setSelId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showMasters, setShowMasters] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const [search, setSearch] = useState("");
  const [showDelivered, setShowDelivered] = useState(false);

  const loadAll = useCallback(async () => {
    const [it, st, cs, lg, cl, sz, us] = await Promise.all([
      db.getItems(), db.getAllStages(), db.getAllColorSizes(), db.getLogs(),
      db.getColorMasters(), db.getSizeMasters(), db.getUsers()
    ]);
    setItems(it);
    const sm = {}; st.forEach(s => { if (!sm[s.item_id]) sm[s.item_id] = {}; sm[s.item_id][s.stage_key] = s.checked; }); setAllStages(sm);
    const cm = {}; cs.forEach(c => { if (!cm[c.item_id]) cm[c.item_id] = []; cm[c.item_id].push(c); }); setAllCS(cm);
    setLogs(lg); setColors(cl); setSizes(sz); setUsers(us);
    setLoaded(true);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!loaded) return;
    const ch = supabase.channel("global").on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => loadAll()).on("postgres_changes", { event: "*", schema: "public", table: "item_stages" }, () => loadAll()).on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, () => loadAll()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loaded, loadAll]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("pt-user") : null;
    if (saved) { try { const u = JSON.parse(saved); setCU(u); } catch(e) {} }
  }, []);

  const handleLogin = (u) => { setCU(u); localStorage.setItem("pt-user", JSON.stringify(u)); };
  const handleRegister = async (u) => { const created = await db.createUser(u); handleLogin(created); setUsers(prev => [...prev, created]); };
  const handleLogout = () => { setCU(null); localStorage.removeItem("pt-user"); };

  const handleAdd = async (f, cq) => {
    const created = await db.createItem({ style_no: f.styleNo, name: f.name, season: f.season, factory: f.factory, unit_price: f.unitPrice, patterner: f.patterner, supplier: f.supplier, has_secondary: f.hasSecondary, secondary_name: f.secName, secondary_address: f.secAddress, secondary_phone: f.secPhone, notes: f.notes, delivery_date: f.deliveryDate || null });
    if (cq.length > 0) await db.setItemColorSizes(created.id, cq.map(r => ({ color_code: r.colorCode, size_code: r.sizeCode, qty: r.qty })));
    const stageKeys = getStageList(f.hasSecondary).map(s => s.key);
    await db.initStages(created.id, stageKeys);
    await db.addLog({ item_id: created.id, user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role, message: `${f.styleNo} 新規追加` });
    setShowAdd(false);
    loadAll();
  };

  if (!loaded) return <div className="flex items-center justify-center min-h-screen text-[var(--text-secondary)]">読み込み中...</div>;
  if (!currentUser) return <LoginScreen users={users} onLogin={handleLogin} onRegister={handleRegister} />;

  // ── Filtering ──
  const seasons = [...new Set(items.map(i => i.season))].sort();
  let visible = filter === "all" ? items : items.filter(i => i.season === filter);

  // search
  const q = search.trim().toLowerCase();
  if (q) visible = visible.filter(i =>
    (i.style_no||"").toLowerCase().includes(q) ||
    (i.name||"").toLowerCase().includes(q) ||
    (i.factory||"").toLowerCase().includes(q) ||
    (i.secondary_name||"").toLowerCase().includes(q)
  );

  // delivered filter
  const deliveredCount = visible.filter(i => (allStages[i.id]||{})["delivered"]).length;
  if (!showDelivered) visible = visible.filter(i => !(allStages[i.id]||{})["delivered"]);

  // sort
  let sorted2 = [...visible];
  if (sort === "factory") sorted2.sort((a,b) => (a.factory||"").localeCompare(b.factory||"","ja"));
  else if (sort === "progress_asc") sorted2.sort((a,b) => calcPct(allStages[a.id]||{},a.has_secondary) - calcPct(allStages[b.id]||{},b.has_secondary));
  else if (sort === "progress_desc") sorted2.sort((a,b) => calcPct(allStages[b.id]||{},b.has_secondary) - calcPct(allStages[a.id]||{},a.has_secondary));
  else if (sort === "deadline") sorted2.sort((a,b) => {
    if (!a.delivery_date && !b.delivery_date) return 0;
    if (!a.delivery_date) return 1;
    if (!b.delivery_date) return -1;
    return a.delivery_date.localeCompare(b.delivery_date);
  });

  // stats
  const activeItems = items.filter(i => !(allStages[i.id]||{})["delivered"]);
  const totalP = activeItems.length ? Math.round(activeItems.reduce((s,i) => s + calcPct(allStages[i.id]||{}, i.has_secondary), 0) / activeItems.length) : 0;
  const doneN = items.length - activeItems.length;
  const urgentN = activeItems.filter(i => { const d = daysUntil(i.delivery_date); return d !== null && d <= 7; }).length;
  const uc = getUserColor(currentUser);
  const sel = items.find(i => i.id === selId);

  const isFS = sort === "factory";
  let fGroups = [];
  if (isFS) { const m = new Map(); sorted2.forEach(item => { const k = item.factory || "未設定"; if (!m.has(k)) m.set(k, []); m.get(k).push(item); }); fGroups = [...m.entries()]; }

  const renderItem = (item) => {
    const sm = allStages[item.id] || {};
    const p2 = calcPct(sm, item.has_secondary);
    const st = getStageList(item.has_secondary);
    const cs = allCS[item.id] || [];
    const tq = totalQty(cs);
    const isD = sm["delivered"];
    const colorNames = cs.map(r => { const c = findMaster(r.color_code, colors); return c?.name || r.color_code; }).filter(Boolean);
    const uniqueColors = [...new Set(colorNames)];

    return (
      <div key={item.id} onClick={() => setSelId(item.id)} className="grid items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors mb-0.5 hover:bg-[var(--hover)] grid-cols-[64px_1fr_50px] sm:grid-cols-[88px_1fr_54px]" style={{ background: isD ? "rgba(42,157,106,0.04)" : "var(--bg-secondary)", borderLeft: isD ? "3px solid rgba(42,157,106,0.3)" : "3px solid transparent", opacity: isD ? 0.7 : 1 }}>
        <div className="w-[64px] h-[64px] sm:w-[88px] sm:h-[88px] rounded-md bg-[var(--bg-tertiary)] flex items-center justify-center overflow-hidden shrink-0">
          {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <div className="flex flex-col items-center gap-1"><span className="text-xl sm:text-2xl opacity-30">📷</span></div>}
        </div>
        <div className="min-w-0">
          <div className="font-mono text-xs text-[var(--text-secondary)] mb-0.5 flex items-center gap-1.5 flex-wrap">
            {item.style_no}
            {isD && <span className="text-[9px] px-1 py-0.5 rounded-sm bg-[rgba(42,157,106,0.15)] text-[#2a9d6a] font-semibold">納品完了</span>}
            <DeadlineBadge deliveryDate={item.delivery_date} isDelivered={isD} />
          </div>
          <div className="text-[14px] sm:text-[15px] font-medium whitespace-nowrap overflow-hidden text-ellipsis mb-1">{item.name}</div>
          <div className="text-[11px] text-[var(--text-secondary)] flex gap-1.5 flex-wrap">
            {!isFS && item.factory && <span>{item.factory}</span>}
            {item.has_secondary && item.secondary_name && <span className="text-[#6b8ec4]">→ {item.secondary_name}</span>}
            {uniqueColors.length > 0 && <span className="hidden sm:inline">· {uniqueColors.join("/")}</span>}
            {tq > 0 && <span>· {tq}枚</span>}
          </div>
          <div className="flex gap-0.5 mt-1.5 flex-wrap">{st.map((s, idx) => { const isSec = s.group==="sec"; const isDel = s.group==="delivery"; return (
            <div key={s.key} title={s.label} className="w-3.5 h-3.5 flex items-center justify-center text-[6px] font-mono" style={{ borderRadius: isDel ? 7 : 3, background: sm[s.key] ? (isDel?"#2a9d6a":isSec?"#6b8ec4":"#2a9d6a") : "var(--bg-tertiary)", color: sm[s.key] ? "#fff" : "var(--text-secondary)", marginLeft: ((isSec&&idx>0&&st[idx-1].group!=="sec")||(isDel)) ? 3 : 0 }}>{sm[s.key] ? "✓" : isDel ? "◎" : s.short.slice(0,1)}</div>
          ); })}</div>
        </div>
        <div className="text-right font-mono text-[14px] sm:text-[15px] font-semibold" style={{ color: statusCol(p2) }}>{p2}%</div>
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-5 min-h-screen">
      {/* Header */}
      <div className="max-w-[960px] mx-auto mb-4 flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight font-mono">量産進捗</h1>
          <div className="mt-1.5 flex gap-3 sm:gap-4 font-mono text-xs text-[var(--text-secondary)] flex-wrap">
            <span>{activeItems.length}型 進行中</span>
            <span>{doneN}完了</span>
            <span>全体 {totalP}%</span>
            {urgentN > 0 && <span className="text-[#e06c6c] font-semibold">⚠ 納期間近 {urgentN}件</span>}
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded" style={{ border: `1.5px solid ${uc}`, background: `${uc}10` }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono text-white" style={{ background: uc }}>{currentUser.name.slice(0,1)}</span>
            <span className="text-xs font-mono" style={{ color: uc }}>{currentUser.name}</span>
            <button onClick={handleLogout} className="bg-transparent border-none text-[var(--text-secondary)] cursor-pointer text-sm pl-1">×</button>
          </div>
          <button onClick={() => setShowMasters(true)} className="px-3 py-1.5 rounded border-[1.5px] border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-xs font-mono cursor-pointer">⚙</button>
          <button onClick={() => setShowLog(!showLog)} className="px-3 py-1.5 rounded border-[1.5px] border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-xs font-mono cursor-pointer">履歴</button>
          <button onClick={() => setShowAdd(true)} className="px-3.5 py-1.5 rounded border-none bg-[var(--text-primary)] text-[var(--bg-primary)] text-xs font-semibold cursor-pointer font-mono">+ 追加</button>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-[960px] mx-auto mb-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-sm">🔍</span>
          <input className={`${IS} !pl-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder="品番・品名・工場・加工先で検索..." />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-[var(--text-secondary)] cursor-pointer">×</button>}
        </div>
      </div>

      {/* Filters & Sort */}
      <div className="max-w-[960px] mx-auto mb-3.5 flex justify-between items-center flex-wrap gap-2.5">
        <div className="flex gap-1.5 items-center flex-wrap">
          {seasons.length > 1 && ["all", ...seasons].map(s => (
            <button key={s} onClick={() => setFilter(s)} className="px-2.5 py-1 rounded-[3px] border border-[var(--border)] text-[11px] font-mono cursor-pointer" style={{ background: filter===s ? "var(--bg-tertiary)" : "transparent", color: filter===s ? "var(--text-primary)" : "var(--text-secondary)" }}>{s === "all" ? "ALL" : s}</button>
          ))}
          <button onClick={() => setShowDelivered(!showDelivered)} className="px-2.5 py-1 rounded-[3px] border text-[11px] font-mono cursor-pointer" style={{ borderColor: showDelivered ? "#2a9d6a" : "var(--border)", background: showDelivered ? "rgba(42,157,106,0.08)" : "transparent", color: showDelivered ? "#2a9d6a" : "var(--text-secondary)" }}>
            {showDelivered ? "✓" : ""}納品済を表示{deliveredCount > 0 && ` (${deliveredCount})`}
          </button>
        </div>
        <div className="flex gap-1.5 items-center flex-wrap">
          <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mr-0.5">並替</span>
          {[{key:"default",label:"登録順"},{key:"deadline",label:"納期順"},{key:"factory",label:"工場別"},{key:"progress_asc",label:"進捗↑"},{key:"progress_desc",label:"進捗↓"}].map(o => (
            <button key={o.key} onClick={() => setSort(o.key)} className="px-2 py-0.5 rounded-[3px] text-[11px] font-mono cursor-pointer" style={{ border: `1px solid ${sort===o.key ? "var(--text-secondary)" : "var(--border)"}`, background: sort===o.key ? "var(--bg-tertiary)" : "transparent", color: sort===o.key ? "var(--text-primary)" : "var(--text-secondary)" }}>{o.label}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="max-w-[960px] mx-auto flex flex-col gap-0.5">
        {isFS ? fGroups.map(([factory, fitems]) => (
          <div key={factory}>
            <div className="px-3.5 py-2 mt-2 mb-1 text-[11px] font-mono text-[var(--text-secondary)] border-b border-[var(--border)] uppercase tracking-wide">{factory} <span className="ml-2 text-[10px]">({fitems.length}型)</span></div>
            {fitems.map(renderItem)}
          </div>
        )) : sorted2.map(renderItem)}
        {sorted2.length === 0 && <div className="text-center py-10 text-[var(--text-secondary)] text-sm">{q ? `「${search}」に一致するアイテムがありません` : "アイテムがありません"}</div>}
      </div>

      {/* Log Panel */}
      {showLog && (
        <div className="fixed right-0 top-0 bottom-0 w-[360px] max-w-[85vw] bg-[var(--bg-primary)] border-l border-[var(--border)] p-5 overflow-y-auto z-[999] shadow-[-4px_0_20px_rgba(0,0,0,0.3)]">
          <div className="flex justify-between items-center mb-4"><h3 className="text-sm font-mono">更新履歴</h3><button onClick={() => setShowLog(false)} className="bg-transparent border-none text-[var(--text-secondary)] text-lg cursor-pointer">×</button></div>
          {logs.length === 0 ? <div className="text-[var(--text-secondary)] text-sm">まだ履歴がありません</div> : logs.map((e, i) => {
            const col = ROLE_COLORS[e.user_role] || "#8a8a8a";
            return <div key={i} className="flex gap-2 items-start py-1.5 border-b border-[var(--border-light)] text-xs">
              <span className="shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold font-mono text-white" style={{ background: col }}>{e.user_name?.slice(0,1)||"?"}</span>
              <div className="flex-1"><span className="text-[var(--text-secondary)] font-mono text-[11px]">{fmtTime(e.created_at)}</span><span className="ml-1 font-mono text-[11px]" style={{ color: col }}>{e.user_name}</span><span className="ml-1.5">{e.message}</span></div>
            </div>;
          })}
        </div>
      )}

      {showAdd && <ItemFormModal onSave={handleAdd} onClose={() => setShowAdd(false)} colors={colors} sizes={sizes} title="+ 新規アイテム" />}

      {showMasters && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1002]" onClick={() => setShowMasters(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-[var(--bg-primary)] rounded-lg p-7 w-[520px] max-w-[94vw] max-h-[90vh] overflow-y-auto border border-[var(--border)]">
            <MastersEditor colors={colors} sizes={sizes} onSave={async (c, s) => { await db.upsertColorMasters(c); await db.upsertSizeMasters(s); loadAll(); setShowMasters(false); }} onClose={() => setShowMasters(false)} />
          </div>
        </div>
      )}

      {sel && <DetailModal item={sel} stagesMap={allStages[sel.id]||{}} colorSizes={allCS[sel.id]||[]} onClose={() => setSelId(null)} currentUser={currentUser} colors={colors} sizes={sizes} onRefresh={loadAll} />}
    </div>
  );
}
