# 架構（精簡版）

完整設計見《橋牌成績分析系統 架構書.md》。改結構時同步更新本檔。

純前端靜態網頁：xlsx 在瀏覽器內解析與計算，不上傳任何伺服器。資料只往下流：

```
解析器 parsers/ → BoardResult（一桌一筆，南北觀點）→ 分析引擎 engine/ → 結論 insights → 介面 ui/
```

| 目錄 | 內容 |
| --- | --- |
| `src/parsers/` | `detect.ts` 格式偵測、`swiss-imp.ts` Swiss R / R1… / Hands / ButlerP 格式、`contract.ts` 合約字串、`names.ts` 配對拆名 |
| `src/model/` | `types.ts` 資料表型別、`store.ts` IndexedDB 暫存 |
| `src/index/` | `players.ts` 賽員索引、模糊搜尋、別名 |
| `src/engine/` | `butler.ts` IMP 與 Datum、`trick-diff.ts` 墩差、`classify.ts` 六類輸贏分類、`insights.ts` 結論規則、`report.ts` 組合個人報告 |
| `src/ui/` | 上傳、搜尋、報告頁、SVG 長條圖、四家牌型圖 |
| `src/config/thresholds.json` | 結論門檻 |

## 成績表格式重點（Swiss R 格式）

- 每個 R 工作表以「NS … Table」列切開對局；同一場以兩隊視角各出現一次，只取主隊編號較小的一筆。
- 合約 `4HXS-3`：正數結果是扣掉 6 墩底的墩數，負數是宕墩；`A` / `Average` 是調整分。
- Datum 欄寫成 `NS180` / `EW230`；Datum = 全場平均往 0 截到 10 分（與成績表逐副一致）。
- Datum 區的 `NS` / `EW` 欄是主隊公開室南北、主隊閉室東西的 Butler。
- COP 欄是裁判額外判給的 IMP，含在對局總 IMP 裡。
- 牌號在不同輪可能重複，牌型以「輪 + 牌號」對應；Hands 以「# 牌號」為錨點定位四家。
- 英文名本身可能含空白，甚至含兩個連續空白，拆配對時先比對 Players 工作表的隊員名單。

## 分析判斷

- 主流合約 = 全場最多桌次的「主打方 + 階數 + 花色」。
- 分類順序：主打方不同 → 競叫；同合約 → 做莊／防守；獎分層級不同 → 成局／滿貫判斷；花色不同 → 選擇王牌；其餘 → 叫牌高度。
- 做莊與防守的 Butler 會被全場叫牌拉動，結論只用墩差判斷；強弱項規則只套用在四個叫牌類別。

## 測試

`npm test`。黃金標準測試讀本機 `資料/` 底下的兩份成績表（不進版控），檔案不存在時自動跳過。
