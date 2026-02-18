import { Format } from "./utils.js";

class AppHelpers {
  filterRows(rows, query, fields) {
    if (!query) return rows;
    return rows.filter((row) => {
      const text = fields.map((field) => String(row[field] ?? "")).join(" ").toLowerCase();
      return text.includes(query);
    });
  }

  countBy(rows, selector) {
    const result = {};
    for (const row of rows) {
      const key = selector(row);
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }

  maxIndex(values) {
    let index = 0;
    let max = Number(values[0]) || 0;
    for (let i = 1; i < values.length; i += 1) {
      const value = Number(values[i]) || 0;
      if (value > max) {
        max = value;
        index = i;
      }
    }
    return index;
  }

  normalizeGender(value) {
    const text = Format.toText(value);
    if (["ชาย", "นาย", "ด.ช."].includes(text)) return "ชาย";
    if (["หญิง", "นาง", "นางสาว", "น.ส.", "ด.ญ."].includes(text)) return "หญิง";
    return text || "-";
  }

  inferGenderFromPrefix(prefix) {
    const text = Format.normalizeFemalePrefix(Format.toText(prefix));
    if (["นาย", "ด.ช."].includes(text)) return "ชาย";
    if (["นาง", "นางสาว", "ด.ญ."].includes(text)) return "หญิง";
    return "หญิง";
  }

  fullNameFromDependent(row) {
    const prefix = Format.normalizeFemalePrefix(row["นาม"] || "");
    const firstName = Format.toText(row["ชื่อ"] || "");
    const lastName = Format.toText(row["สกุล"] || "");
    return `${prefix}${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
  }

  buildAddress(row) {
    const home = String(row["ที่อยู่"] || "-");
    const moo = String(row["หมู่"] || "-");
    return `${home} หมู่ ${moo}`;
  }
}

export { AppHelpers };
