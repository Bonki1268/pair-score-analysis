import type { Seat } from '../model/types';
import type { PlayerEntry } from '../index/players';
import { CATEGORIES, categoryLabel, EXTRA_CATEGORIES, formatMainstream, formatTied } from '../engine/classify';
import type { Dataset, PlayerReport, ReviewItem } from '../engine/report';
import { teamEvent, teamRef } from '../engine/player-boards';
import thresholds from '../config/thresholds.json';
import { divergingBars } from './charts';
import { dealDiagram } from './deal-diagram';
import { contractHtml, esc, h, signClass, signed, suitHtml } from './format';
import { reportHref } from './search';

export interface ReportParams {
  name: string;
  event?: string;
  team?: string;
  partner?: string;
}

export function renderReport(ds: Dataset, rep: PlayerReport, params: ReportParams, entries: PlayerEntry[]): HTMLElement {
  const events = [...new Map(entries.map((e) => [e.eventId, e.eventName])).entries()];
  const inEvent = (e: PlayerEntry) => !params.event || e.eventId === params.event;
  const shown = entries.filter((e) => inEvent(e) && (!params.team || teamEvent(params.team) !== e.eventId || teamRef(e.eventId, e.teamNo) === params.team));
  const teams = [...new Set(shown.map((e) => e.teamName))];
  // 同一賽事出現在兩隊以上（同名不同人）時才需要選隊伍
  const perEvent = new Map<string, number>();
  for (const e of entries) perEvent.set(e.eventId, (perEvent.get(e.eventId) ?? 0) + 1);
  const teamChoices = entries.filter((e) => inEvent(e) && perEvent.get(e.eventId)! > 1);
  const allPartners = [...new Set(rep.partners.map((p) => p.key))];

  const el = h(`
    <div class="report">
      <a class="back" href="#/">← 回到搜尋</a>
      <header class="report-head">
        <h1>${esc(rep.name)}</h1>
        <div class="muted">${esc(teams.join('、'))}</div>
        <div class="filters">
          <label>賽事
            <select data-filter="event">
              <option value="">全部合併（${events.length} 份）</option>
              ${events.map(([id, name]) => `<option value="${esc(id)}" ${params.event === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}
            </select>
          </label>
          ${
            teamChoices.length
              ? `<label>隊伍
            <select data-filter="team">
              <option value="">全部隊伍</option>
              ${teamChoices
                .map((e) => {
                  const ref = teamRef(e.eventId, e.teamNo);
                  return `<option value="${esc(ref)}" ${params.team === ref ? 'selected' : ''}>${esc(params.event ? e.teamName : `${e.teamName} · ${e.eventName}`)}</option>`;
                })
                .join('')}
            </select>
          </label>`
              : ''
          }
          <label>搭檔
            <select data-filter="partner">
              <option value="">全部搭檔</option>
              ${[...new Set([...(params.partner ? [params.partner] : []), ...allPartners])]
                .map((p) => `<option value="${esc(p)}" ${params.partner === p ? 'selected' : ''}>${esc(p)}</option>`)
                .join('')}
            </select>
          </label>
        </div>
      </header>
      ${rep.boards === 0 ? '<section class="card"><p>這個條件下沒有牌局紀錄。</p></section>' : body(ds, rep, params)}
    </div>`);

  el.querySelectorAll<HTMLSelectElement>('select[data-filter]').forEach((sel) =>
    sel.addEventListener('change', () => {
      const next = { ...params, [sel.dataset.filter!]: sel.value || undefined };
      if (sel.dataset.filter !== 'partner') next.partner = undefined;
      // 換到另一份賽事時，原本選的隊伍不屬於該賽事，要清掉
      if (sel.dataset.filter === 'event' && sel.value && next.team && teamEvent(next.team) !== sel.value) next.team = undefined;
      location.hash = reportHref(params.name, next);
    }),
  );
  return el;
}

function body(ds: Dataset, rep: PlayerReport, params: ReportParams): string {
  return [summary(rep), categories(rep), tricks(rep), partners(rep, params), seatsAndRounds(rep), review(ds, rep), method()].join('');
}

function stat(label: string, value: string, cls = '', sub = ''): string {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value ${cls}">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
}

function summary(rep: PlayerReport): string {
  const rank = rep.rank
    ? stat('排名', `${rep.rank.position} / ${rep.rank.of}`, '', `贏過 ${rep.rank.percentile.toFixed(0)}% 的賽員`)
    : stat('排名', '—', '', '選定搭檔時不排名');
  return `<section class="card">
    <h2>摘要</h2>
    <div class="stats">
      ${stat('牌數', String(rep.boards))}
      ${stat('Butler 總分', signed(rep.butler), signClass(rep.butler), 'IMP')}
      ${stat('每牌 IMP', signed(rep.perBoard, 2), signClass(rep.perBoard))}
      ${rank}
    </div>
    ${
      rep.sheetScore && rep.sheetScore.label !== 'Butler'
        ? `<p class="muted small">成績表原本的 ${rep.sheetScore.label} 總分：<strong class="${signClass(rep.sheetScore.imp)}">${signed(rep.sheetScore.imp)}</strong>。為了和其他賽事比較，本頁一律以 Datum 計算 Butler。</p>`
        : ''
    }
    <p class="headline">${esc(rep.headline)}</p>
    ${
      rep.insights.length
        ? `<ul class="insights">${rep.insights.map((i) => `<li class="insight-${i.kind}"><strong>${esc(i.text)}</strong><span class="muted small">${esc(i.evidence)}</span></li>`).join('')}</ul>`
        : ''
    }
  </section>`;
}

function categories(rep: PlayerReport): string {
  const isTech = (id: string) => CATEGORIES.some((x) => x.id === id);
  const bars = rep.categories.map((c) => ({ label: c.label, value: c.imp, note: `${c.boards} 副`, neutral: !isTech(c.id) }));
  const hasNoConsensus = rep.categories.some((c) => c.id === 'no-consensus');
  return `<section class="card">
    <h2>輸贏分類</h2>
    <p class="muted small">每副牌和全場「主流合約」比較後歸入一類，再把該牌的 Butler 計入。</p>
    ${divergingBars(bars, { unit: ' IMP' })}
    <table class="table">
      <thead><tr><th>類別</th><th>面向</th><th class="num">牌數</th><th class="num">淨 IMP</th><th class="num">每牌</th></tr></thead>
      <tbody>${rep.categories
        .map((c) => {
          const meta = CATEGORIES.find((x) => x.id === c.id);
          const hint = meta?.hint ?? EXTRA_CATEGORIES.find((x) => x.id === c.id)?.hint ?? '';
          // 非技術類別用中性色，不以紅綠表示好壞
          const cls = (x: number) => (meta ? signClass(x) : '');
          return `<tr class="${meta ? '' : 'neutral'}"><td title="${esc(hint)}">${esc(c.label)}${c.id === 'no-consensus' ? ' *' : ''}</td><td>${esc(meta?.facet ?? '—')}</td><td class="num">${c.boards}</td><td class="num ${cls(c.imp)}">${signed(c.imp)}</td><td class="num ${cls(c.perBoard)}">${c.boards ? signed(c.perBoard, 2) : '—'}</td></tr>`;
        })
        .join('')}</tbody>
    </table>
    ${hasNoConsensus ? '<p class="muted small">* 全場無共識：主流合約平手的牌，全場對打法沒有共識，不計入技術類別。</p>' : ''}
    <p class="muted small">做莊與防守兩類的 Butler 會被全場叫牌拉動（例如對手叫到全場多數沒叫的成局，防守方就是負分），請以下方的墩差判斷做莊與防守。</p>
  </section>`;
}

function trickCard(label: string, s: PlayerReport['declare']): string {
  if (s.count === 0) return stat(label, '—', '', '沒有可比較的牌');
  return stat(label, `${signed(s.mean, 2)} 墩`, signClass(s.mean), `比較 ${s.count} 副 · 較好 ${s.better} · 較差 ${s.worse}`);
}

function tricks(rep: PlayerReport): string {
  return `<section class="card">
    <h2>做莊與防守</h2>
    <div class="stats stats-2">
      ${trickCard('做莊墩差', rep.declare)}
      ${trickCard('防守墩差', rep.defend)}
    </div>
    <p class="muted small">和同一副牌「同一方主打、同階、同花色」的其他桌次比墩數（至少 ${thresholds.trickCompareMinTables} 桌才計算）。正數代表比全場好；差距 ≥ ${thresholds.trickBetterWorseMargin} 墩才算較好／較差。</p>
  </section>`;
}

const trickCell = (x: number | null) => (x === null ? '—' : `<span class="${signClass(x)}">${signed(x, 2)}</span>`);

function partners(rep: PlayerReport, params: ReportParams): string {
  return `<section class="card">
    <h2>搭檔比較</h2>
    <div class="scroll"><table class="table">
      <thead><tr><th>搭檔</th><th class="num">牌數</th><th class="num">每牌 IMP</th><th class="num">做莊墩差</th><th class="num">防守墩差</th></tr></thead>
      <tbody>${rep.partners
        .map((p) => `<tr><td><a href="${esc(reportHref(rep.name, { ...params, partner: p.key }))}">${esc(p.label)}</a></td><td class="num">${p.boards}</td><td class="num ${signClass(p.perBoard)}">${signed(p.perBoard, 2)}</td><td class="num">${trickCell(p.declare)}</td><td class="num">${trickCell(p.defend)}</td></tr>`)
        .join('')}</tbody>
    </table></div>
  </section>`;
}

function seatsAndRounds(rep: PlayerReport): string {
  const multiEvent = new Set(rep.rounds.map((r) => r.eventId)).size > 1;
  const bars = rep.rounds.map((r) => ({ label: `${multiEvent ? r.eventName.split(/\s+/).pop() + ' ' : ''}R${r.round}`, value: r.imp, note: r.opponent }));
  return `<section class="card">
    <h2>座位與輪次</h2>
    <table class="table">
      <thead><tr><th>座位</th><th class="num">牌數</th><th class="num">每牌 IMP</th><th class="num">做莊墩差</th><th class="num">防守墩差</th></tr></thead>
      <tbody>${rep.seats
        .map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${s.boards}</td><td class="num ${signClass(s.perBoard)}">${signed(s.perBoard, 2)}</td><td class="num">${trickCell(s.declare)}</td><td class="num">${trickCell(s.defend)}</td></tr>`)
        .join('')}</tbody>
    </table>
    <h3>逐輪 Butler</h3>
    ${divergingBars(bars, { unit: ' IMP' })}
    <p class="muted small">長條左側為該輪對手。對手強弱未調整，打弱隊的輪次會拉高平均。</p>
  </section>`;
}

function review(ds: Dataset, rep: PlayerReport): string {
  return `<section class="card">
    <h2>復盤清單</h2>
    <p class="muted small">成績表沒有叫牌過程與首攻，系統只能指出失分落在哪一類；請對照牌型與全場結果復盤。</p>
    <h3>失分最大的 ${rep.review.worst.length} 副</h3>
    ${rep.review.worst.map((r) => reviewRow(ds, r)).join('')}
    <h3>得分最大的 ${rep.review.best.length} 副</h3>
    ${rep.review.best.map((r) => reviewRow(ds, r)).join('')}
  </section>`;
}

function reviewRow(ds: Dataset, r: ReviewItem): string {
  const pb = r.item.pb;
  const res = pb.result;
  const mySeats: Seat[] = pb.side === 'NS' ? ['N', 'S'] : ['E', 'W'];
  const eventShort = (ds.eventNames.get(res.eventId) ?? '').split(/\s+/).pop();
  const isTeams = ds.eventInfo.get(res.eventId)?.kind !== 'pairs';
  const where = isTeams ? `${res.room === 'open' ? '公開室' : '閉室'}，` : '';

  // 全場分布：同合約同得分合併
  const groups = new Map<string, { html: string; score: number; n: number; mine: boolean }>();
  for (const f of r.field) {
    const k = `${f.contract.raw}|${f.nsScore}`;
    const g = groups.get(k) ?? { html: contractHtml(f.contract), score: f.nsScore, n: 0, mine: false };
    g.n++;
    if (f === res) g.mine = true;
    groups.set(k, g);
  }
  const myScore = (s: number) => (pb.side === 'NS' ? s : -s);
  return `<details class="review">
    <summary>
      <span class="review-board">${esc(eventShort)} R${res.round} 第 ${res.board} 副</span>
      <span class="review-contract">${contractHtml(res.contract)}</span>
      <span class="review-cat">${r.item.category === 'no-consensus' ? '<span class="tag tag-neutral">無共識</span> ' : ''}${esc(categoryLabel(r.item.category))}${r.item.overbid ? ' · 叫過頭' : ''}</span>
      <span class="review-imp ${signClass(pb.butler)}">${signed(pb.butler)}</span>
    </summary>
    <div class="review-body">
      <p class="small">你坐${pb.side === 'NS' ? '南北' : '東西'}（${where}搭檔 ${esc(pb.partner)}），得分 ${signed(pb.score)}，Datum ${signed(myScore(res.datum))}。${
        r.item.tied.length
          ? `主流合約平手：${suitHtml(formatTied(r.item.tied))}，全場對打法沒有共識，不計入技術類別。`
          : `主流合約：${suitHtml(formatMainstream(r.item.mainstream))}。`
      }</p>
      ${r.deal ? dealDiagram(r.deal, mySeats) : '<p class="muted small">這份成績表沒有牌型。</p>'}
      <h4>全場結果（${r.field.length} 桌，以你的方向計分）</h4>
      <table class="table field">
        <thead><tr><th>合約</th><th class="num">得分</th><th class="num">桌數</th></tr></thead>
        <tbody>${[...groups.values()]
          .sort((a, b) => myScore(b.score) - myScore(a.score))
          .map((g) => `<tr class="${g.mine ? 'mine' : ''}"><td>${g.html}${g.mine ? ' <span class="tag">你</span>' : ''}</td><td class="num">${signed(myScore(g.score))}</td><td class="num">${g.n}</td></tr>`)
          .join('')}</tbody>
      </table>
    </div>
  </details>`;
}

function method(): string {
  return `<section class="card">
    <details>
      <summary><h2 class="inline">方法說明</h2></summary>
      <div class="method small">
        <p><strong>Butler</strong>：每副牌的全場平均分（Datum）由成績表提供；你的得分與 Datum 的差距換成 IMP。</p>
        <p><strong>主流合約</strong>：同一副牌最多桌次打的「主打方 + 階數 + 花色」；四家 Pass 也算一種合約。</p>
        <p><strong>平手</strong>：最多桌次的合約有兩個以上時，代表全場沒有共識。若選不同的候選會讓這副牌歸入不同類別，就歸入「全場無共識」，不計入任何技術類別；每個候選都得到同一類別時照常歸類。自己和主流都是 Pass 的牌歸入「Pass 局」。</p>
        <p><strong>輸贏分類</strong>，依序判斷：</p>
        <ol>
          <li>主打方和主流不同（含一邊 Pass）→ 競叫</li>
          <li>階數與花色都和主流相同 → 我方主打為「做莊」，對方主打為「防守」</li>
          <li>部分合約／成局／小滿貫／大滿貫層級不同 → 成局／滿貫判斷</li>
          <li>王牌花色或無王不同 → 選擇王牌；否則 → 叫牌高度</li>
        </ol>
        <p>主打宕 ${thresholds.overbidDownTricks} 墩以上另外標記「叫過頭」，可以和其他類別同時成立。調整分、Pass 局與全場無共識不計入技術類別，也不用來判斷強弱項。</p>
        <p><strong>墩差</strong>：和同一副牌、同一方主打、同階、同花色的其他桌次比墩數，排除叫牌的影響。</p>
        <p><strong>結論規則</strong>：叫牌類別每牌 ≤ ${thresholds.weakCategoryImpPerBoard} IMP 且至少 ${thresholds.categoryMinBoards} 副為弱項、≥ +${thresholds.strongCategoryImpPerBoard} 為強項；墩差 ≤ ${thresholds.trickDiffWeak} 且至少 ${thresholds.trickDiffMinBoards} 副為偏弱；主打至少 ${thresholds.overbidMinDeclared} 副、其中宕 ${thresholds.overbidDownTricks} 墩以上達 ${thresholds.overbidRate * 100}% 為常叫過頭；總牌數少於 ${thresholds.minSampleBoards} 副時所有結論僅供參考。</p>
        <p><strong>限制</strong>：成績表沒有叫牌過程與首攻，無法判斷失分「為什麼」發生；墩差不區分首攻方向；對手強弱未調整。</p>
      </div>
    </details>
  </section>`;
}
