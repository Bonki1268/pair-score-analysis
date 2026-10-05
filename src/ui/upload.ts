import type { ParsedEvent } from '../model/types';
import { validateEvent, type Check } from '../engine/validate';
import { esc, h } from './format';

export interface UploadHandlers {
  onFiles(files: File[]): void;
  onDelete(eventId: string): void;
}

export function renderUpload(events: ParsedEvent[], errors: string[], handlers: UploadHandlers): HTMLElement {
  const el = h(`
    <section class="card">
      <h2>1. 上傳成績表</h2>
      <label class="dropzone" tabindex="0">
        <input type="file" accept=".xlsx,.xls" multiple hidden>
        <strong>拖放成績表到這裡（xlsx 或 xls）</strong>
        <span>或點一下選擇檔案，可一次選多份</span>
      </label>
      <p class="muted small">檔案只在你的瀏覽器裡解析與計算，不會上傳到任何伺服器。</p>
      ${errors.map((e) => `<p class="error" role="alert">${esc(e)}</p>`).join('')}
      <ul class="events">${events.map(eventRow).join('')}</ul>
    </section>`);
  const input = el.querySelector('input')!;
  const zone = el.querySelector('.dropzone') as HTMLElement;
  input.addEventListener('change', () => {
    if (input.files?.length) handlers.onFiles([...input.files]);
    input.value = '';
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) handlers.onFiles(files);
  });
  el.querySelectorAll<HTMLButtonElement>('button[data-delete]').forEach((b) =>
    b.addEventListener('click', () => handlers.onDelete(b.dataset.delete!)),
  );
  return el;
}

const STATUS_ICON: Record<Check['status'], string> = { pass: '✓', fail: '✗', skip: '–' };

/** 成績表自我核對結果：全部通過時收合，有失敗時展開 */
function checksHtml(e: ParsedEvent): string {
  const checks = validateEvent(e);
  const failed = checks.filter((c) => c.status === 'fail').length;
  const ran = checks.filter((c) => c.status !== 'skip').length;
  const passed = ran - failed;
  const summary = failed === 0 ? `核對 ${passed}/${ran} 項通過` : `核對 ${failed} 項有問題，報告數字可能不正確`;
  return `<details class="checks ${failed ? 'checks-fail' : 'checks-pass'}" ${failed ? 'open' : ''}>
    <summary>${summary}</summary>
    <ul>${checks
      .map((c) => `<li class="check-${c.status}"><span class="check-icon" aria-label="${c.status}">${STATUS_ICON[c.status]}</span><span><strong>${esc(c.label)}</strong>：${esc(c.detail)}</span></li>`)
      .join('')}</ul>
  </details>`;
}

function eventRow(e: ParsedEvent): string {
  const w = e.warnings.length;
  return `<li class="event">
    <div class="event-main">
      <div><strong>${esc(e.event.name)}</strong></div>
      <div class="muted small">${e.teams.length} 隊 · ${e.event.rounds} 輪 × ${e.event.boardsPerRound} 副 · ${e.results.length} 筆桌次結果</div>
      ${checksHtml(e)}
      ${
        w
          ? `<details class="warnings"><summary>${w} 則解析警告</summary><ul>${e.warnings
              .map((x) => `<li>${esc(x.sheet)}${x.cell ? ` ${esc(x.cell)}` : ''}：${esc(x.reason)}${x.raw ? `（${esc(x.raw)}）` : ''}</li>`)
              .join('')}</ul></details>`
          : ''
      }
    </div>
    <button class="ghost" data-delete="${esc(e.event.eventId)}" aria-label="移除 ${esc(e.event.name)}">移除</button>
  </li>`;
}
