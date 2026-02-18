import { SORTED_PREFIXES } from "./config.js";

class Format {
  static escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  static number(value) {
    return new Intl.NumberFormat("th-TH").format(Number(value) || 0);
  }

  static currency(value) {
    return `${Format.number(value)} ฿`;
  }

  static toText(value) {
    return String(value ?? "").trim();
  }

  static cleanWhitespace(value) {
    return Format.toText(value).replace(/\s+/g, " ");
  }

  static normalizeFemalePrefix(value) {
    const text = Format.toText(value);
    return text === "น.ส." ? "นางสาว" : text;
  }

  static expandFemalePrefixInText(value) {
    return String(value ?? "").replaceAll("น.ส.", "นางสาว");
  }

  static isoToDateInput(value) {
    const text = Format.toText(value);
    return text ? text.slice(0, 10) : "";
  }

  static dateInputToIso(value) {
    const text = Format.toText(value);
    return text ? `${text}T00:00:00` : null;
  }

  static todayDateInput() {
    return new Date().toISOString().slice(0, 10);
  }

  static formatDate(value) {
    const text = Format.toText(value);
    if (!text) return "-";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleDateString("th-TH");
  }

  static formatDateCompact(value) {
    const text = Format.toText(value);
    if (!text) return "-";
    return text.slice(0, 10);
  }
}

class Validate {
  static required(value) {
    return Format.toText(value).length > 0;
  }

  static nonNegative(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0;
  }

  static positive(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }

  static thaiCitizenId(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += Number(digits[i]) * (13 - i);
    }
    const checkDigit = (11 - (sum % 11)) % 10;
    return checkDigit === Number(digits[12]);
  }

  static phone(value) {
    const text = String(value ?? "").replace(/[\s-]/g, "");
    if (!text) return true;
    return /^\d{8,12}$/.test(text);
  }
}

class NameUtils {
  static parse(fullName) {
    const raw = Format.cleanWhitespace(fullName);
    if (!raw) {
      return { prefix: "", firstName: "", lastName: "" };
    }

    let prefix = "";
    let body = raw;
    for (const knownPrefix of SORTED_PREFIXES) {
      if (body.startsWith(knownPrefix)) {
        prefix = Format.normalizeFemalePrefix(knownPrefix);
        body = body.slice(knownPrefix.length).trim();
        break;
      }
    }

    const parts = body.split(" ").filter(Boolean);
    const firstName = parts.shift() || "";
    const lastName = parts.join(" ");

    return { prefix, firstName, lastName };
  }

  static compose(prefix, firstName, lastName, forceFemaleFull = false) {
    let normalizedPrefix = Format.cleanWhitespace(prefix);
    if (forceFemaleFull) normalizedPrefix = Format.normalizeFemalePrefix(normalizedPrefix);
    const left = `${normalizedPrefix}${Format.cleanWhitespace(firstName)}`.trim();
    const right = Format.cleanWhitespace(lastName);
    return `${left} ${right}`.replace(/\s+/g, " ").trim();
  }
}

export { Format, Validate, NameUtils };
