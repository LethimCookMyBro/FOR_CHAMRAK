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
    .map((item) => `<div class="info-row ${item.strong ? "strong" : ""}"><span>${Format.escapeHtml(item.label)}</span><strong>${Format.currency(item.value)}</strong></div>`)
    .join("");
}

export { renderCheckCell, renderInfoRows, selectedRowClass };
