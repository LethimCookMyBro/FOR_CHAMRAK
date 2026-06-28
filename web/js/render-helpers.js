import { Format } from "./utils.js";

function checkedAttribute(isChecked) {
  return isChecked ? "checked" : "";
}

function selectedRowClass(rowId, selectedRowId) {
  return rowId === selectedRowId ? "is-selected" : "";
}

function renderCheckCell(isChecked) {
  return `<td class="check-col"><input class="row-check" type="checkbox" ${checkedAttribute(isChecked)} aria-label="เลือกแถว"></td>`;
}

function renderInfoRows(rows) {
  return rows
    .map((item) => {
      // Use a pre-formatted `display` string verbatim (e.g. counts like "3 ราย");
      // only fall back to currency formatting for raw numeric `value` (finance).
      const text = item.display != null ? item.display : Format.currency(item.value);
      return `<div class="info-row ${item.strong ? "strong" : ""}"><span>${Format.escapeHtml(item.label)}</span><strong>${Format.escapeHtml(text)}</strong></div>`;
    })
    .join("");
}

export { renderCheckCell, renderInfoRows, selectedRowClass };
