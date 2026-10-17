import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Sparkles, Shuffle, ShieldCheck, ShieldAlert, History, Settings2, Gem, Copy, Check, Cloud, CloudOff, Trash2 } from 'lucide-react';
import './style.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('YOUR_PROJECT')
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const starterHistory = [
  { id: 'demo-1', item_name: 'แหวนจันทรา', result: 'แท้', authenticity_rate: 50, member_name: 'อาเรีย', created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
  { id: 'demo-2', item_name: 'ขวดน้ำยาลึกลับ', result: 'ปลอม', authenticity_rate: 50, member_name: 'เรเวน', created_at: new Date(Date.now() - 1000 * 60 * 42).toISOString() },
  { id: 'demo-3', item_name: 'กุญแจหอคอย', result: 'แท้', authenticity_rate: 50, member_name: 'ลูเมีย', created_at: new Date(Date.now() - 1000 * 60 * 80).toISOString() }
];

function App() {
  const [itemName, setItemName] = useState('กล่องปริศนา');
  const [memberName, setMemberName] = useState(() => localStorage.getItem('rof-member') || '');
  const [rate, setRate] = useState(50);
  const [history, setHistory] = useState(starterHistory);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);

  useEffect(() => {
    localStorage.setItem('rof-member', memberName);
  }, [memberName]);

  useEffect(() => {
    if (!supabase) {
      const saved = localStorage.getItem('rof-demo-history');
      if (saved) {
        try { setHistory(JSON.parse(saved)); } catch { /* ignore bad local cache */ }
      }
      return;
    }
    let active = true;
    const load = async () => {
      const [settingsRes, historyRes] = await Promise.all([
        supabase.from('app_settings').select('authenticity_rate').eq('id', 1).maybeSingle(),
        supabase.from('draw_history').select('*').order('created_at', { ascending: false }).limit(50)
      ]);
      if (!active) return;
      if (settingsRes.data) setRate(settingsRes.data.authenticity_rate);
      if (!historyRes.error && historyRes.data) setHistory(historyRes.data);
      setCloudReady(!settingsRes.error && !historyRes.error);
      if (settingsRes.error || historyRes.error) setNotice('เชื่อมต่อฐานข้อมูลไม่สำเร็จ ตรวจสอบค่า Supabase และ SQL');
    };
    load();
    const channel = supabase.channel('rof-live-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draw_history' }, payload => {
        if (payload.eventType === 'INSERT') setHistory(prev => [payload.new, ...prev.filter(x => x.id !== payload.new.id)].slice(0, 50));
        if (payload.eventType === 'DELETE') setHistory(prev => prev.filter(x => x.id !== payload.old.id));
      }).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  const stats = useMemo(() => ({
    total: history.length,
    authentic: history.filter(x => x.result === 'แท้').length,
    fake: history.filter(x => x.result === 'ปลอม').length
  }), [history]);

  async function drawItem() {
    const name = itemName.trim();
    if (!name) { setNotice('กรุณาใส่ชื่อไอเทมก่อนสุ่ม'); return; }
    if (name.length > 100) { setNotice('ชื่อไอเทมต้องไม่เกิน 100 ตัวอักษร'); return; }
    if (!memberName.trim()) { setNotice('กรุณาใส่ชื่อผู้เล่นก่อนสุ่ม'); return; }
    setBusy(true); setNotice('');
    // This is a client-side demo draw. For competitive/valuable rewards, move randomness to a trusted server.
    const outcome = Math.random() * 100 < rate ? 'แท้' : 'ปลอม';
    const record = {
      item_name: name,
      result: outcome,
      authenticity_rate: rate,
      member_name: memberName.trim().slice(0, 40)
    };
    setResult(record);
    if (supabase) {
      const { data, error } = await supabase.from('draw_history').insert(record).select().single();
      if (error) {
        setNotice('สุ่มแล้ว แต่บันทึกลงฐานข้อมูลไม่ได้: ' + error.message);
      } else {
        setHistory(prev => [data, ...prev.filter(x => x.id !== data.id)].slice(0, 50));
        setCloudReady(true);
      }
    } else {
      const localRecord = { ...record, id: `local-${Date.now()}`, created_at: new Date().toISOString() };
      const next = [localRecord, ...history].slice(0, 50);
      setHistory(next);
      localStorage.setItem('rof-demo-history', JSON.stringify(next));
      setNotice('โหมดทดลอง: ประวัติเก็บเฉพาะในเครื่องนี้');
    }
    setBusy(false);
  }

  async function saveRate(nextRate) {
    setRate(nextRate);
    if (!supabase) {
      setNotice('โหมดทดลอง: ค่าเปอร์เซ็นต์มีผลเฉพาะเครื่องนี้');
      return;
    }
    const { error } = await supabase.from('app_settings').update({ authenticity_rate: nextRate, updated_at: new Date().toISOString() }).eq('id', 1);
    setNotice(error ? 'บันทึกค่าไม่ได้: ' + error.message : 'บันทึกเปอร์เซ็นต์แล้ว');
  }

  async function clearHistory() {
    if (!window.confirm('ต้องการล้างประวัติทั้งหมดหรือไม่? การลบนี้มีผลกับสมาชิกทุกคน')) return;
    if (!supabase) {
      setHistory([]);
      localStorage.removeItem('rof-demo-history');
      setNotice('ล้างประวัติในเครื่องแล้ว');
      return;
    }
    const { error } = await supabase.from('draw_history').delete().gt('id', 0);
    setNotice(error ? 'ล้างประวัติไม่ได้: ' + error.message : 'ส่งคำขอล้างประวัติแล้ว');
    if (!error) setHistory([]);
  }

  async function shareApp() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice('คัดลอกลิงก์ไม่ได้ กรุณาคัดลอกจากแถบที่อยู่ของเบราว์เซอร์');
    }
  }

  const dateLabel = value => new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand-mark"><Sparkles size={22} /></div>
        <div className="brand-copy"><strong>REALITY <span>OR</span> FAKE</strong><small>ROLEPLAY ITEM SYSTEM</small></div>
        <button className="icon-button" aria-label="ตั้งค่า" onClick={() => setShowSettings(v => !v)}><Settings2 size={20} /></button>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-line" /> THE MYSTIC VAULT <span className="eyebrow-line" /></div>
        <div className="orb"><div className="orb-ring ring-one"/><div className="orb-ring ring-two"/><Gem className="orb-gem" size={54}/><Sparkles className="orb-spark spark-a" size={18}/><Sparkles className="orb-spark spark-b" size={13}/></div>
        <h1>กล่องปริศนา</h1>
        <p>สิ่งใดซ่อนอยู่ภายใน… ความจริงหรือภาพลวง?</p>
        <div className="chance-row">
          <div className="chance-card authentic"><ShieldCheck size={22}/><div><strong>{rate}%</strong><span>ของแท้</span></div></div>
          <div className="chance-card fake"><ShieldAlert size={22}/><div><strong>{100-rate}%</strong><span>ของปลอม</span></div></div>
        </div>
      </section>

      {showSettings && <section className="panel settings-panel">
        <div className="panel-title"><Settings2 size={18}/><h2>ตั้งค่าระบบ</h2></div>
        <label className="field-label" htmlFor="rate">โอกาสได้ของแท้ <b>{rate}%</b></label>
        <input id="rate" className="range" type="range" min="0" max="100" step="5" value={rate} onChange={e => saveRate(Number(e.target.value))}/>
        <p className="hint">ค่าเปอร์เซ็นต์เป็นการตั้งค่าร่วมเมื่อเชื่อมต่อฐานข้อมูล</p>
      </section>}

      <section className="panel draw-panel">
        <div className="panel-title"><span className="title-glyph">✦</span><h2>เริ่มการสุ่ม</h2><span className="panel-subtitle">ITEM DRAW</span></div>
        <label className="field-label" htmlFor="member">ชื่อผู้เล่น</label>
        <input id="member" className="text-input" value={memberName} maxLength={40} onChange={e => setMemberName(e.target.value)} placeholder="ใส่ชื่อโรลเพลย์ของคุณ"/>
        <label className="field-label" htmlFor="item">ชื่อไอเทม</label>
        <input id="item" className="text-input" value={itemName} maxLength={100} onChange={e => setItemName(e.target.value)} placeholder="เช่น แหวนจันทรา"/>
        <button className="draw-button" onClick={drawItem} disabled={busy}><Shuffle size={20}/>{busy ? 'กำลังสุ่ม…' : 'สุ่มไอเทม'}<span className="button-shine"/></button>
        {result && <div className={`result-card ${result.result === 'แท้' ? 'result-real' : 'result-fake'}`}>
          <div className="result-icon">{result.result === 'แท้' ? <ShieldCheck size={32}/> : <ShieldAlert size={32}/>}</div>
          <div><small>ผลการสุ่มของคุณ</small><h3>{result.result === 'แท้' ? '✦ ของแท้ ✦' : '✧ ของปลอม ✧'}</h3><p>{result.item_name}</p></div>
          <span className="result-chip">{result.result}</span>
        </div>}
        {notice && <p className="notice" role="status">{notice}</p>}
        <p className="fine-print">ผลสุ่มนี้เป็นส่วนหนึ่งของโรลเพลย์ ไม่ใช่การรับรองสินค้าจริง</p>
      </section>

      <section className="stats-grid">
        <div className="stat-box"><span>สุ่มทั้งหมด</span><strong>{stats.total}</strong></div>
        <div className="stat-box"><span>ของแท้</span><strong className="green">{stats.authentic}</strong></div>
        <div className="stat-box"><span>ของปลอม</span><strong className="red">{stats.fake}</strong></div>
      </section>

      <section className="panel history-panel">
        <div className="panel-title"><History size={18}/><h2>บันทึกการสุ่ม</h2><span className="live-tag"><i/> {supabase && cloudReady ? 'LIVE' : 'DEMO'}</span></div>
        <p className="hint history-hint">{supabase ? 'ประวัติร่วมของสมาชิกในกลุ่ม' : 'ตัวอย่างประวัติ — โหมดทดลองเก็บข้อมูลในเครื่อง'}</p>
        {history.length === 0 ? <div className="empty-state"><History size={28}/><p>ยังไม่มีประวัติการสุ่ม</p></div> :
          <div className="history-list">{history.slice(0, 12).map((entry, index) => <article className="history-row" key={entry.id ?? index}>
            <div className={`history-icon ${entry.result === 'แท้' ? 'real' : 'fake'}`}>{entry.result === 'แท้' ? <ShieldCheck size={18}/> : <ShieldAlert size={18}/>}</div>
            <div className="history-main"><strong>{entry.item_name}</strong><span>{entry.member_name || 'ผู้เล่น'} · {dateLabel(entry.created_at || new Date())}</span></div>
            <span className={`history-result ${entry.result === 'แท้' ? 'real-text' : 'fake-text'}`}>{entry.result}</span>
          </article>)}</div>}
        <div className="history-actions"><button className="text-button" onClick={shareApp}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์แอป'}</button><button className="text-button danger-text" onClick={clearHistory}><Trash2 size={15}/> ล้างประวัติ</button></div>
      </section>

      <footer className="footer"><div className="footer-emblem">✦</div><p>EVERY ITEM HAS A STORY</p><small>{supabase && cloudReady ? <><Cloud size={13}/> เชื่อมต่อฐานข้อมูลแล้ว</> : <><CloudOff size={13}/> ยังไม่เชื่อมฐานข้อมูลกลาง</>}</small></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
