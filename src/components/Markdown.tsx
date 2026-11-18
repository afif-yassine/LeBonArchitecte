// Rendu Markdown sûr (aucun HTML injecté) : titres, listes, cases à cocher, tableaux, citations,
// code, liens, gras, italique. Les schémas ```svg sont affichés comme image (une image SVG ne peut
// exécuter aucun script), donc un document écrit par un agent ne peut rien faire dans l'interface.
import type { ReactNode } from 'react';

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function headings(text: string): { level: number; text: string; id: string }[] {
  const out: { level: number; text: string; id: string }[] = [];
  let fence = false;
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('```')) fence = !fence;
    const m = !fence && l.match(/^(#{2,3}) (.+)$/);
    if (m) { const t = m[2].replace(/[*`]/g, ''); out.push({ level: m[1].length, text: t, id: slug(t) }); }
  }
  return out;
}

function inline(s: string, onLink?: (href: string) => void): ReactNode[] {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g).map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{inline(p.slice(2, -2), onLink)}</strong>;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    const a = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (a) {
      const [, label, href] = a;
      if (/^https?:\/\//.test(href)) return <a key={i} href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
      if (onLink) return <button key={i} className="md__link" onClick={() => onLink(href)}>{label}</button>;
      return <span key={i}>{label}</span>;
    }
    return p;
  });
}

const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ text, onLink }: { text: string; onLink?: (href: string) => void }) {
  const out: ReactNode[] = [];
  const L = text.split(/\r?\n/);
  const isList = (l: string) => /^\s*([-*+]|\d+[.)]) /.test(l);
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (/^```svg/.test(l)) {
      const b: string[] = [];
      while (++i < L.length && !L[i].startsWith('```')) b.push(L[i]);
      out.push(<figure key={i} className="md__fig"><img src={svgSrc(b.join('\n'))} alt="Schéma" /></figure>);
    } else if (l.startsWith('```')) {
      const b: string[] = [];
      while (++i < L.length && !L[i].startsWith('```')) b.push(L[i]);
      out.push(<pre key={i} className="md__code">{b.join('\n')}</pre>);
    } else if (/^#{1,4} /.test(l)) {
      const lvl = l.match(/^#+/)![0].length;
      const t = l.replace(/^#+ /, '');
      const H = (['h2', 'h2', 'h3', 'h4'] as const)[lvl - 1];
      out.push(<H key={i} id={slug(t.replace(/[*`]/g, ''))} className={`md__h md__h${lvl}`}>{inline(t, onLink)}</H>);
    } else if (/^(-{3,}|\*{3,})\s*$/.test(l)) {
      out.push(<hr key={i} className="md__hr" />);
    } else if (/^> ?/.test(l)) {
      const b: string[] = [];
      for (; i < L.length && /^> ?/.test(L[i]); i++) b.push(L[i].replace(/^> ?/, ''));
      i--;
      out.push(<blockquote key={i} className="md__quote">{inline(b.join(' '), onLink)}</blockquote>);
    } else if (/^\|/.test(l.trim()) && i + 1 < L.length && /^\|?[\s:|-]+\|?$/.test(L[i + 1].trim())) {
      const head = cells(l);
      const rows: string[][] = [];
      for (i += 2; i < L.length && /^\|/.test(L[i].trim()); i++) rows.push(cells(L[i]));
      i--;
      out.push(
        <div key={i} className="md__table"><table>
          <thead><tr>{head.map((c, k) => <th key={k}>{inline(c, onLink)}</th>)}</tr></thead>
          <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c, onLink)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
    } else if (isList(l)) {
      const ordered = /^\s*\d+[.)] /.test(l);
      const items: { text: string; depth: number; check?: boolean }[] = [];
      for (; i < L.length && (isList(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length)); i++) {
        if (!isList(L[i])) { items[items.length - 1].text += ` ${L[i].trim()}`; continue; }
        const depth = Math.min(2, Math.floor((L[i].match(/^\s*/)![0].length) / 2));
        let t = L[i].replace(/^\s*([-*+]|\d+[.)]) /, '');
        const c = t.match(/^\[( |x|X)\] /);
        if (c) t = t.slice(4);
        items.push({ text: t, depth, check: c ? c[1] !== ' ' : undefined });
      }
      i--;
      const hasCheck = items.some((x) => x.check !== undefined);
      const Tag = ordered && !hasCheck ? 'ol' : 'ul';
      out.push(
        <Tag key={i} className={`md__list ${hasCheck ? 'md__list--check' : ''}`}>
          {items.map((it, k) => (
            <li key={k} style={it.depth ? { marginLeft: it.depth * 18 } : undefined} className={it.check ? 'is-done' : ''}>
              {it.check !== undefined && <span className={`md__box ${it.check ? 'is-on' : ''}`} role="img" aria-label={it.check ? 'fait' : 'à faire'} />}
              <span>{inline(it.text, onLink)}</span>
            </li>
          ))}
        </Tag>,
      );
    } else if (l.trim()) {
      const b = [l];
      for (; i + 1 < L.length && L[i + 1].trim() && !/^(#|>|```|\||\s*([-*+]|\d+[.)]) |-{3,})/.test(L[i + 1]); i++) b.push(L[i + 1]);
      out.push(<p key={i}>{inline(b.join(' '), onLink)}</p>);
    }
  }
  return <div className="md">{out}</div>;
}
