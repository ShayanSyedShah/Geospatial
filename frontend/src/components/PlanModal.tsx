import { useEffect, useState } from 'react';
import { api } from '../services/api';

interface Props {
  country: string;
  district: string | null;
  intensity: number;
  depthM: number;
  onClose: () => void;
}

// Minimal, dependency-free markdown → HTML for the plan preview.
function renderMd(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  let html = '', inTable = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;
      if (!inTable) { html += '<table class="plan-table"><tbody>'; inTable = true; }
      html += '<tr>' + cells.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>';
      continue;
    }
    if (inTable) { html += '</tbody></table>'; inTable = false; }
    if (line.startsWith('# ')) html += `<h1>${esc(line.slice(2))}</h1>`;
    else if (line.startsWith('## ')) html += `<h2>${esc(line.slice(3))}</h2>`;
    else if (line.startsWith('- ')) html += `<li>${inline(esc(line.slice(2)))}</li>`;
    else if (/^\d+\. /.test(line)) html += `<li>${inline(esc(line.replace(/^\d+\. /, '')))}</li>`;
    else if (line === '') html += '';
    else html += `<p>${inline(esc(line))}</p>`;
  }
  if (inTable) html += '</tbody></table>';
  return html;
}
function inline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

export default function PlanModal({ country, district, intensity, depthM, onClose }: Props) {
  const [md, setMd] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.plan(country, district, intensity, depthM)
      .then((r) => setMd(r.markdown))
      .catch((e) => setErr(String(e)));
  }, [country, district, intensity, depthM]);

  const download = () => {
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beacon_action_plan_${(district ?? country).replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal plan" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Flood Action Plan</h2>
            <p>{district ?? country} · {depthM.toFixed(1)} m scenario · every number sourced</p>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body plan-body">
          {err && <div className="toast error" style={{ position: 'static' }}>Could not build plan — {err}</div>}
          {!md && !err && <div className="conn-status">Composing the cited plan…</div>}
          {md && <div className="plan-doc" dangerouslySetInnerHTML={{ __html: renderMd(md) }} />}
        </div>
        <div className="modal-foot">
          <button className="tb-btn ghost" onClick={onClose}>Close</button>
          <button className="tb-btn primary" disabled={!md} onClick={download}>⬇ Download (.md)</button>
        </div>
      </div>
    </div>
  );
}
