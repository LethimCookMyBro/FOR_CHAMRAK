import { Format, Validate, NameUtils } from "./utils.js";
import { FINANCE_EXPENSE_LABELS, FINANCE_INCOME_LABELS, VISIT_STATUS_OPTIONS } from "./config.js";

const FINANCE_CATEGORY_LABELS = { income: FINANCE_INCOME_LABELS, expense: FINANCE_EXPENSE_LABELS };

// Pure view model for the finance "หมวด" dropdown: which options + label to show
// for a given type. Category values stay 1-5 (positional storage), so this is
// display-only. Exported so the behavior is unit-testable without a DOM.
function financeCategoryView(typeValue) {
  const labels = FINANCE_CATEGORY_LABELS[typeValue];
  if (!labels) {
    return { type: "", disabled: true, label: "หมวด", options: [{ value: "", text: "เลือกประเภทก่อน" }] };
  }
  return {
    type: typeValue,
    disabled: false,
    label: typeValue === "income" ? "หมวดรายรับ" : "หมวดรายจ่าย",
    options: [
      { value: "", text: "เลือกหมวด" },
      ...labels.map((label, index) => ({ value: String(index + 1), text: `${index + 1}. ${label}` }))
    ]
  };
}

class EntityDialogService {
  constructor(el, repo, domain, helpers) {
    this.el = el;
    this.repo = repo;
    this.domain = domain;
    this.helpers = helpers;
  }

  async openDependentDialog(mode, row = null) {
    const [unitRows, cmRows, cgRows] = await Promise.all([
      this.repo.getTable("t26_unit"),
      this.repo.getTable("t02_cm"),
      this.repo.getTable("t01_cg")
    ]);

    const initial = {
      citizenId: row?.["เลขประชาชน"] || "",
      prefix: Format.normalizeFemalePrefix(row?.["นาม"] || "นาย"),
      firstName: row?.["ชื่อ"] || "",
      lastName: row?.["สกุล"] || "",
      gender: row?.["เพศ"] || this.helpers.inferGenderFromPrefix(row?.["นาม"] || "นาย"),
      adl: row?.ADL ?? 0,
      tai: String(row?.TAI || "I1").toUpperCase(),
      group: row?.G || this.domain.getTaiGroup(row?.TAI || "I1"),
      birthDate: row?.["วันเดือนปีเกิด"] || null,
      address: row?.["ที่อยู่"] || "",
      moo: row?.["หมู่"] || "",
      road: row?.["ถนน"] || "",
      subdistrict: row?.["ตำบล"] || "",
      district: row?.["อำเภอ"] || "",
      province: row?.["จังหวัด"] || "ตราด",
      unitCode: row?.["รหัสหน่วย"] || "",
      cmCode: row?.["รหัสcm"] || "",
      cgCode: row?.["รหัสcg"] || "",
      careStart: row?.["วันเริ่ม cp"] || null,
      careEnd: row?.["วันสิ้นสุด cp"] || null,
      photoDataUrl: row?.photoDataUrl || ""
    };
    const unitOptions = unitRows
      .map((unit) => ({
        value: unit["รหัสหน่วย"] || "",
        label: `${unit["รหัสหน่วย"] || "-"} - ${unit["หน่วย"] || "-"}`
      }))
      .filter((option) => option.value);
    const cmOptions = cmRows
      .map((cm) => ({
        value: cm["รหัสcm"] || "",
        label: Format.expandFemalePrefixInText(cm["ชื่อสกุล"] || "-")
      }))
      .filter((option) => option.value);
    const cgOptions = cgRows
      .map((cg) => ({
        value: cg["รหัสcg"] || "",
        label: Format.expandFemalePrefixInText(cg["ชื่อสกุล"] || "-")
      }))
      .filter((option) => option.value);

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มผู้รับบริการ LTC" : "แก้ไขผู้รับบริการ LTC",
      hint: "กรอกข้อมูลสำคัญที่ใช้จริงในหน้างาน ข้อมูลจะเชื่อมกับภาพรวมทันที",
      fields: [
        { name: "photoDataUrl", label: "รูปผู้รับบริการ", type: "image", value: initial.photoDataUrl, wide: true },
        {
          name: "citizenId",
          label: "เลขบัตรประชาชน",
          type: "text",
          required: true,
          value: initial.citizenId,
          wide: true,
          placeholder: "13 หลัก",
          validate: (value) => {
            if (!/^\d{13}$/.test(value)) return "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
            if (!Validate.thaiCitizenId(value)) return "เลขบัตรประชาชนไม่ผ่านการตรวจสอบ";
            return null;
          }
        },
        {
          name: "prefix",
          label: "คำนำหน้า",
          type: "select",
          required: true,
          value: initial.prefix,
          options: ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ."]
        },
        { name: "firstName", label: "ชื่อ", type: "text", required: true, value: initial.firstName },
        { name: "lastName", label: "สกุล", type: "text", required: true, value: initial.lastName },
        {
          name: "gender",
          label: "เพศ",
          type: "select",
          required: true,
          value: initial.gender,
          options: ["ชาย", "หญิง"]
        },
        {
          name: "adl",
          label: "คะแนน ADL",
          type: "number",
          required: true,
          value: Number(initial.adl),
          min: 0,
          max: 20,
          validate: (value) => {
            if (!Validate.nonNegative(value)) return "ADL ต้องไม่ติดลบ";
            if (Number(value) > 20) return "ADL ต้องไม่เกิน 20";
            return null;
          }
        },
        {
          name: "group",
          label: "กลุ่ม",
          type: "select",
          required: true,
          value: String(initial.group || "1"),
          options: [
            { value: "1", label: "กลุ่ม 1 (I1)" },
            { value: "2", label: "กลุ่ม 2 (I2)" },
            { value: "3", label: "กลุ่ม 3 (I3)" },
            { value: "4", label: "กลุ่ม 4 (B3/C2/C3)" }
          ]
        },
        {
          name: "tai",
          label: "ระดับการพึ่งพิง (TAI)",
          type: "select",
          required: true,
          value: initial.tai,
          options: ["I1", "I2", "I3", "B3", "C2", "C3"]
        },
        { name: "birthDate", label: "วันเดือนปีเกิด", type: "date", value: initial.birthDate },
        { name: "address", label: "บ้านเลขที่", type: "text", required: true, value: initial.address },
        { name: "moo", label: "หมู่", type: "text", value: initial.moo },
        { name: "road", label: "ถนน", type: "text", value: initial.road },
        { name: "subdistrict", label: "ตำบล", type: "text", required: true, value: initial.subdistrict },
        { name: "district", label: "อำเภอ", type: "text", required: true, value: initial.district },
        { name: "province", label: "จังหวัด", type: "text", required: true, value: initial.province },
        {
          name: "unitCode",
          label: "รหัสหน่วย",
          type: unitOptions.length ? "select" : "text",
          required: true,
          value: initial.unitCode,
          placeholder: unitOptions.length ? "" : "กรอกรหัสหน่วย",
          options: unitOptions
        },
        {
          name: "cmCode",
          label: "ชื่อ CM",
          type: cmOptions.length ? "select" : "text",
          value: initial.cmCode,
          placeholder: cmOptions.length ? "" : "กรอกรหัส CM",
          options: cmOptions
        },
        {
          name: "cgCode",
          label: "ชื่อ CG",
          type: cgOptions.length ? "select" : "text",
          value: initial.cgCode,
          placeholder: cgOptions.length ? "" : "กรอกรหัส CG",
          options: cgOptions
        },
        { name: "careStart", label: "วันเริ่ม Care Plan", type: "date", value: initial.careStart },
        { name: "careEnd", label: "วันสิ้นสุด Care Plan", type: "date", value: initial.careEnd }
      ],
      afterRender: (controls) => {
        const notice = document.createElement("small");
        notice.className = "field-status";
        notice.setAttribute("role", "status");
        notice.setAttribute("aria-live", "polite");
        controls.tai?.parentElement?.appendChild(notice);

        const paint = () => {
          const result = this.domain.getTaiConsistency(controls.adl?.value, controls.tai?.value);
          if (!result.expected) {
            notice.textContent = "";
            notice.classList.remove("is-warning");
            return;
          }
          notice.textContent = result.consistent
            ? `ADL นี้แนะนำกลุ่ม ${result.expected}`
            : `ADL นี้แนะนำกลุ่ม ${result.expected} - ${result.warning}`;
          notice.classList.toggle("is-warning", !result.consistent);
        };

        controls.adl?.addEventListener("input", paint);
        controls.tai?.addEventListener("change", () => {
          if (controls.group) controls.group.value = String(this.domain.getTaiGroup(controls.tai?.value));
          paint();
        });
        paint();
      }
    });
  }

  async openCgDialog(mode, row = null) {
    const cmRows = await this.repo.getTable("t02_cm");
    const parsedName = NameUtils.parse(row?.["ชื่อสกุล"] || "");
    const cmOptions = cmRows
      .map((cm) => ({
        value: cm["รหัสcm"] || "",
        label: Format.expandFemalePrefixInText(cm["ชื่อสกุล"] || "-")
      }))
      .filter((option) => option.value);

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่ม Care Giver (CG)" : "แก้ไข Care Giver (CG)",
      hint: "คำนำหน้าผู้หญิงจะแสดงเป็น 'นางสาว' เสมอ",
      fields: [
        { name: "photoDataUrl", label: "รูป CG", type: "image", value: row?.photoDataUrl || "", wide: true },
        {
          name: "cgCode",
          label: "รหัส CG",
          type: "text",
          value: row?.["รหัสcg"] || "",
          wide: true,
          placeholder: "ปล่อยว่างเพื่อสร้างอัตโนมัติ"
        },
        {
          name: "prefix",
          label: "คำนำหน้า",
          type: "select",
          required: true,
          value: Format.normalizeFemalePrefix(parsedName.prefix || "นางสาว"),
          options: ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ."]
        },
        { name: "firstName", label: "ชื่อ", type: "text", required: true, value: parsedName.firstName },
        { name: "lastName", label: "สกุล", type: "text", required: true, value: parsedName.lastName },
        {
          name: "phone",
          label: "โทรศัพท์",
          type: "text",
          value: row?.["โทร"] || "",
          validate: (value) => (Validate.phone(value) ? null : "รูปแบบเบอร์โทรไม่ถูกต้อง")
        },
        { name: "birthDate", label: "วันเดือนปีเกิด", type: "date", value: row?.["วดปเกิด"] || null },
        { name: "address", label: "บ้านเลขที่", type: "text", required: true, value: row?.["ที่อยู่"] || "" },
        { name: "moo", label: "หมู่", type: "text", value: row?.["หมู่"] || "" },
        { name: "subdistrict", label: "ตำบล", type: "text", required: true, value: row?.["ตำบล"] || "" },
        { name: "district", label: "อำเภอ", type: "text", required: true, value: row?.["อำเภอ"] || "" },
        { name: "province", label: "จังหวัด", type: "text", required: true, value: row?.["จังหวัด"] || "ตราด" },
        {
          name: "cmCode",
          label: "ชื่อ CM",
          type: cmOptions.length ? "select" : "text",
          required: true,
          value: row?.["รหัสcm"] || "",
          placeholder: cmOptions.length ? "" : "กรอกรหัส CM",
          options: cmOptions
        }
      ]
    });
  }

  async openCmDialog(mode, row = null) {
    const unitRows = await this.repo.getTable("t26_unit");
    const parsedName = NameUtils.parse(row?.["ชื่อสกุล"] || "");
    const unitOptions = unitRows
      .map((unit) => ({
        value: unit["รหัสหน่วย"] || "",
        label: `${unit["รหัสหน่วย"] || "-"} - ${unit["หน่วย"] || "-"}`
      }))
      .filter((option) => option.value);

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่ม Care Manager (CM)" : "แก้ไข Care Manager (CM)",
      hint: "แก้ไขรหัส CM ได้ โดยระบบจะอัปเดตรหัสที่เชื่อมอยู่ให้อัตโนมัติ",
      fields: [
        { name: "photoDataUrl", label: "รูป CM", type: "image", value: row?.photoDataUrl || "", wide: true },
        {
          name: "cmCode",
          label: "รหัส CM",
          type: "text",
          value: row?.["รหัสcm"] || "",
          wide: true,
          placeholder: "ปล่อยว่างเพื่อสร้างรหัสใหม่"
        },
        {
          name: "prefix",
          label: "คำนำหน้า",
          type: "select",
          required: true,
          value: Format.normalizeFemalePrefix(parsedName.prefix || "นางสาว"),
          options: ["นาย", "นาง", "นางสาว", "พ.จ.อ.", "จ.ส.อ.", "ด.ช.", "ด.ญ."]
        },
        { name: "firstName", label: "ชื่อ", type: "text", required: true, value: parsedName.firstName },
        { name: "lastName", label: "สกุล", type: "text", required: true, value: parsedName.lastName },
        {
          name: "unitCode",
          label: "รหัสหน่วย",
          type: unitOptions.length ? "select" : "text",
          required: true,
          value: row?.["รหัสหน่วย"] || "",
          placeholder: unitOptions.length ? "" : "กรอกรหัสหน่วย",
          options: unitOptions
        },
        {
          name: "phone",
          label: "โทรศัพท์",
          type: "text",
          value: row?.["โทร"] || "",
          validate: (value) => (Validate.phone(value) ? null : "รูปแบบเบอร์โทรไม่ถูกต้อง")
        },
        { name: "birthDate", label: "วันเดือนปีเกิด", type: "date", value: row?.["วดปเกิด"] || null },
        { name: "address", label: "บ้านเลขที่", type: "text", required: true, value: row?.["ที่อยู่"] || "" },
        { name: "moo", label: "หมู่", type: "text", value: row?.["หมู่"] || "" },
        { name: "subdistrict", label: "ตำบล", type: "text", required: true, value: row?.["ตำบล"] || "" },
        { name: "district", label: "อำเภอ", type: "text", required: true, value: row?.["อำเภอ"] || "" },
        { name: "province", label: "จังหวัด", type: "text", required: true, value: row?.["จังหวัด"] || "ตราด" }
      ]
    });
  }

  async openVisitDialog(mode, row = null) {
    const [dependentRows, cgRows, cmRows] = await Promise.all([
      this.repo.getTable("t04_dataj"),
      this.repo.getTable("t01_cg"),
      this.repo.getTable("t02_cm")
    ]);

    const initial = {
      beneficiaryId: row?.beneficiaryId || "",
      visitDate: row?.visitDate || Format.todayDateInput(),
      visitorName: row?.visitorName || row?.responsibleCgName || row?.responsibleCmName || "",
      responsibleCgId: row?.responsibleCgId || "",
      responsibleCmId: row?.responsibleCmId || "",
      activityType: row?.activityType || "",
      status: row?.status || "completed",
      note: row?.note || ""
    };

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มบันทึกเยี่ยมบ้าน" : "แก้ไขบันทึกเยี่ยมบ้าน",
      hint: "บันทึกผลการเยี่ยมจริงของ CG/CM โดยนับความครอบคลุมเฉพาะสถานะ completed",
      fields: [
        {
          name: "beneficiaryId",
          label: "ผู้รับบริการ",
          type: "select",
          required: true,
          value: initial.beneficiaryId,
          options: dependentRows.map((item) => {
            const id = this.domain.dependentId(item);
            return {
              value: id,
              label: `${id || "-"} - ${this.helpers.fullNameFromDependent(item) || "-"}`
            };
          })
        },
        { name: "visitDate", label: "วันที่เยี่ยม", type: "date", required: true, value: initial.visitDate },
        { name: "visitorName", label: "ชื่อ-นามสกุลผู้เข้าเยี่ยม", type: "text", required: true, value: initial.visitorName },
        {
          name: "responsibleCgId",
          label: "CG ผู้รับผิดชอบ",
          type: "select",
          value: initial.responsibleCgId,
          options: cgRows.map((item) => ({
            value: item["รหัสcg"] || item["เธฃเธซเธฑเธชcg"] || "",
            label: Format.expandFemalePrefixInText(item["ชื่อสกุล"] || item["เธเธทเนเธญเธชเธเธธเธฅ"] || "-")
          }))
        },
        {
          name: "responsibleCmId",
          label: "CM ผู้รับผิดชอบ",
          type: "select",
          value: initial.responsibleCmId,
          options: cmRows.map((item) => ({
            value: item["รหัสcm"] || item["เธฃเธซเธฑเธชcm"] || "",
            label: Format.expandFemalePrefixInText(item["ชื่อสกุล"] || item["เธเธทเนเธญเธชเธเธธเธฅ"] || "-")
          }))
        },
        { name: "activityType", label: "กิจกรรม/ประเภทการเยี่ยม", type: "text", required: true, value: initial.activityType },
        {
          name: "status",
          label: "สถานะ",
          type: "select",
          required: true,
          value: initial.status,
          options: VISIT_STATUS_OPTIONS
        },
        { name: "note", label: "หมายเหตุ", type: "textarea", wide: true, value: initial.note }
      ]
    });
  }

  async openCmRateDialog(row = null) {
    const group = String(row?.Group || "");
    const groupLabelMap = {
      "1": "I1",
      "2": "I2",
      "3": "I3",
      "4": "B3/C2/C3"
    };
    const groupLabel = groupLabelMap[group] || group || "-";

    return this.openEntityDialog({
      title: "แก้ไขอัตราการดูแลและค่าตอบแทน CM",
      hint: `กลุ่ม ${groupLabel}`,
      fields: [
        {
          name: "visitsPerYear",
          label: "ครั้งดูแล/ปี",
          type: "number",
          required: true,
          value: Number(row?.number || 0),
          min: 0,
          step: 1,
          validate: (value) => (Validate.nonNegative(value) ? null : "จำนวนครั้งต้องไม่ติดลบ")
        },
        {
          name: "rateCm",
          label: "ค่าตอบแทน CM/ครั้ง (บาท)",
          type: "number",
          required: true,
          value: Number(row?.rateCm || 0),
          min: 0,
          step: 0.01,
          validate: (value) => (Validate.nonNegative(value) ? null : "ค่าตอบแทนต้องไม่ติดลบ")
        }
      ]
    });
  }

  async openProductDialog(mode, row = null) {
    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มวัสดุทางการแพทย์" : "แก้ไขวัสดุทางการแพทย์",
      hint: "ข้อมูลจะถูกใช้คำนวณคงคลังและมูลค่าโดยอัตโนมัติ",
      fields: [
        { name: "imageDataUrl", label: "รูปวัสดุ", type: "image", value: row?.imageDataUrl || "", wide: true },
        { name: "productID", label: "รหัสวัสดุ", type: "text", required: true, value: row?.productID || "" },
        { name: "productName", label: "ชื่อวัสดุ", type: "text", required: true, value: row?.productName || "" },
        { name: "brand", label: "ยี่ห้อ", type: "text", value: row?.brand || "" },
        {
          name: "machineCode",
          label: "รหัสเครื่อง/Serial",
          type: "text",
          value: row?.machineCode || "",
          help: "ระบุสำหรับอุปกรณ์ที่ต้องติดตามรายเครื่อง"
        },
        { name: "unit", label: "หน่วยนับ", type: "text", required: true, value: row?.unit || "ชิ้น" },
        {
          name: "price",
          label: "ราคาต่อหน่วย (บาท)",
          type: "number",
          required: true,
          value: Number(row?.price || 0),
          min: 0,
          step: 0.01,
          validate: (value) => (Validate.nonNegative(value) ? null : "ราคาต้องไม่ติดลบ")
        }
      ]
    });
  }

  async openSupplyMovementDialog(mode, productRow, defaults = null) {
    const isIn = mode === "in";
    const initial = defaults && typeof defaults === "object" ? defaults : {};
    const [typeRows, dependentRows] = await Promise.all([
      this.repo.getTable(isIn ? "t11_intype" : "t15_outtype").catch(() => []),
      isIn ? Promise.resolve([]) : this.repo.getTable("t04_dataj").catch(() => [])
    ]);

    let typeOptions = (Array.isArray(typeRows) ? typeRows : [])
      .map((row) => {
        const value = Format.toText(row?.intypeID ?? row?.outtypeID ?? row?.intype ?? row?.outtype ?? "");
        if (!value) return null;
        const name = Format.toText(row?.intypename ?? row?.outtypename ?? row?.inlist ?? row?.outlist ?? "");
        return {
          value,
          label: name ? `${value} - ${name}` : value
        };
      })
      .filter(Boolean);

    const initialTypeCode = Format.toText(initial.typeCode || "");
    if (initialTypeCode && !typeOptions.some((item) => String(item.value || "") === initialTypeCode)) {
      typeOptions = [{ value: initialTypeCode, label: `${initialTypeCode} - (เดิม)` }, ...typeOptions];
    }

    let dependentOptions = (Array.isArray(dependentRows) ? dependentRows : [])
      .map((row) => {
        const citizenId = Format.toText(row?.["เลขประชาชน"]);
        if (!citizenId) return null;
        const fullName = this.helpers.fullNameFromDependent(row) || "-";
        const tai = Format.toText(row?.TAI || "-");
        return {
          value: citizenId,
          label: `${citizenId} - ${fullName} (${tai})`
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label, "th"));

    const initialLtcCode = Format.toText(initial.ltcCode || "");
    if (initialLtcCode && !dependentOptions.some((item) => String(item.value || "") === initialLtcCode)) {
      dependentOptions = [{ value: initialLtcCode, label: `${initialLtcCode} - (ไม่พบในรายชื่อปัจจุบัน)` }, ...dependentOptions];
    }

    const fields = [
      {
        name: "typeCode",
        label: isIn ? "ประเภทรายการรับเข้า" : "ประเภทการเบิก",
        type: typeOptions.length ? "select" : "text",
        required: true,
        value: initialTypeCode || typeOptions[0]?.value || "11",
        options: typeOptions,
        placeholder: typeOptions.length ? "" : "เช่น 11"
      },
      {
        name: "date",
        label: "วันที่",
        type: "date",
        required: true,
        value: initial.date || Format.todayDateInput()
      },
      {
        name: "quantity",
        label: "จำนวน",
        type: "number",
        required: true,
        value: Math.max(1, Number(initial.quantity || 1)),
        min: 1,
        validate: (value) => (Validate.positive(value) ? null : "จำนวนต้องมากกว่า 0")
      }
    ];

    if (!isIn) {
      fields.push(
        dependentOptions.length
          ? {
              name: "ltcCode",
              label: "ผู้รับเบิก (เลขประชาชน)",
              type: "select",
              required: false,
              options: dependentOptions,
              value: initialLtcCode,
              validate: (value) => (Format.toText(value) ? null : "กรุณาเลือกผู้รับเบิก")
            }
          : {
              name: "ltcCode",
              label: "ผู้รับเบิก (เลขประชาชน)",
              type: "text",
              required: true,
              value: initialLtcCode,
              placeholder: "เลขประชาชน 13 หลัก"
            },
        {
          name: "round",
          label: "รอบ",
          type: "number",
          required: true,
          value: Math.max(1, Number(initial.round || 1)),
          min: 1,
          step: 1,
          validate: (value) => (Validate.positive(value) ? null : "รอบต้องมากกว่า 0")
        },
        {
          name: "brand",
          label: "ยี่ห้อที่จ่าย",
          type: "text",
          value: initial.brand ?? (productRow.brand || "")
        },
        {
          name: "machineCode",
          label: "รหัสเครื่องที่จ่าย",
          type: "text",
          value: initial.machineCode ?? (productRow.machineCode || ""),
          help: "ระบุกรณีเป็นอุปกรณ์รายเครื่อง"
        }
      );
    }

    fields.push(
      {
        name: "reference",
        label: "เลขอ้างอิง",
        type: "text",
        required: true,
        value: Format.toText(initial.reference || "")
      },
      {
        name: "note",
        label: "หมายเหตุ",
        type: "textarea",
        wide: true,
        value: Format.toText(initial.note || "")
      }
    );

    return this.openEntityDialog({
      title: Format.toText(initial.dialogTitle) || (isIn ? "รับเข้าวัสดุ (+)" : "เบิกจ่ายวัสดุ (-)"),
      hint: `${productRow.productName || "-"} (${productRow.productID || "-"})`,
      fields
    });
  }

  async openFinanceDialog(mode, parsed = null) {
    const todayYear = new Date().getFullYear() + 543;
    const type = parsed?.type === "income" || parsed?.type === "expense" ? parsed.type : "";
    const category = parsed?.category && parsed.category !== "-" ? Number(parsed.category) : 0;
    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มรายการการเงิน" : "แก้ไขรายการการเงิน",
      hint: "เลือกประเภทเป็นรายรับหรือรายจ่ายก่อน แล้วเลือกหมวดของประเภทนั้น ระบบจะสรุปยอดให้ทันที",
      fields: [
        {
          name: "date",
          label: "วันที่รายการ",
          type: "date",
          required: true,
          value: parsed?.date || Format.todayDateInput()
        },
        {
          name: "type",
          label: "ประเภท",
          type: "select",
          required: true,
          value: type,
          // empty option lets the user consciously pick income/expense first
          options: [
            { value: "income", label: "รายรับ" },
            { value: "expense", label: "รายจ่าย" }
          ]
        },
        {
          // Options are (re)built by afterRender based on the selected type, so
          // income and expense never share one confusing category list.
          name: "category",
          label: "หมวด",
          type: "select",
          required: true,
          value: "",
          options: []
        },
        {
          name: "amount",
          label: "จำนวนเงิน (บาท)",
          type: "number",
          required: true,
          value: Number(parsed?.amount || 0),
          min: 0,
          step: 0.01,
          validate: (value) => (Validate.nonNegative(value) ? null : "จำนวนเงินต้องไม่ติดลบ")
        },
        {
          name: "year",
          label: "ปีงบประมาณ (พ.ศ.)",
          type: "number",
          required: true,
          value: Number(parsed?.year || todayYear),
          min: 2500,
          max: 2700,
          validate: (value) => {
            const year = Number(value);
            if (!Number.isFinite(year)) return "ปีงบประมาณไม่ถูกต้อง";
            if (year < 2500 || year > 2700) return "ปีงบประมาณต้องอยู่ในช่วง 2500-2700";
            return null;
          }
        },
        {
          name: "note",
          label: "หมายเหตุ",
          type: "textarea",
          wide: true,
          value: parsed?.note || ""
        }
      ],
      afterRender: (controls) => this.wireFinanceCategory(controls, { initialType: type, initialCategory: category })
    });
  }

  // Makes the "หมวด" dropdown follow the "ประเภท" dropdown: income vs expense get
  // their own category list, changing type resets the chosen category, and the
  // field label/placeholder update to match. Category values stay 1-5 (positional).
  wireFinanceCategory(controls, { initialType, initialCategory }) {
    const typeSelect = controls.type;
    const categorySelect = controls.category;
    if (!typeSelect || !categorySelect) return;

    const labelEl = categorySelect.closest(".row-field")?.querySelector("label");
    const setLabel = (text) => {
      if (labelEl) labelEl.innerHTML = `${Format.escapeHtml(text)} <span class="req">*</span>`;
    };
    const makeOption = (value, text) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      return option;
    };

    // Prepend an empty option so "ประเภท" can start unchosen.
    if (!typeSelect.querySelector('option[value=""]')) {
      typeSelect.insertBefore(makeOption("", "เลือกประเภท"), typeSelect.firstChild);
    }
    typeSelect.value = initialType || "";

    const rebuild = (typeValue, selectedCategory) => {
      const view = financeCategoryView(typeValue);
      categorySelect.replaceChildren();
      for (const option of view.options) categorySelect.appendChild(makeOption(option.value, option.text));
      categorySelect.disabled = view.disabled;
      const wanted = String(selectedCategory || "");
      categorySelect.value = view.options.some((option) => option.value === wanted && wanted) ? wanted : "";
      setLabel(view.label);
    };

    rebuild(typeSelect.value, initialCategory);
    typeSelect.addEventListener("change", () => rebuild(typeSelect.value, 0)); // reset category on type change
  }

  async openUnitDialog(mode, row = null) {
    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มหน่วยงาน" : "แก้ไขหน่วยงาน",
      hint: "แก้ไขรหัสหน่วยได้ โดยระบบจะอัปเดตข้อมูลที่เชื่อมอยู่ให้อัตโนมัติ",
      fields: [
        { name: "unitCode", label: "รหัสหน่วย", type: "text", required: true, value: row?.["รหัสหน่วย"] || "" },
        { name: "unitName", label: "ชื่อหน่วยงาน", type: "text", required: true, value: row?.["หน่วย"] || "" },
        { name: "addressNo", label: "เลขที่", type: "text", required: true, value: row?.["เลขที่"] || "" },
        { name: "moo", label: "หมู่", type: "text", value: row?.["หมู่"] || "" },
        { name: "road", label: "ถนน", type: "text", value: row?.["ถนน"] || "" },
        { name: "subdistrict", label: "ตำบล", type: "text", required: true, value: row?.["ตำบล"] || "" },
        { name: "district", label: "อำเภอ", type: "text", required: true, value: row?.["อำเภอ"] || "" },
        { name: "province", label: "จังหวัด", type: "text", required: true, value: row?.["จังหวัด"] || "ตราด" },
        { name: "postcode", label: "รหัสไปรษณีย์", type: "text", value: row?.["รหัส"] || "" },
        {
          name: "phone",
          label: "โทรศัพท์",
          type: "text",
          value: row?.["โทร"] || "",
          validate: (value) => (Validate.phone(value) ? null : "รูปแบบเบอร์โทรไม่ถูกต้อง")
        }
      ]
    });
  }

  readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
      reader.readAsDataURL(file);
    });
  }

  async compressImageFile(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
    }

    const originalDataUrl = await this.readImageFileAsDataUrl(file);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("ไฟล์รูปภาพไม่ถูกต้อง"));
      image.src = originalDataUrl;
    });

    const maxSize = 640;
    const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * ratio));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  // Click-to-open Buddhist-Era calendar. Chromium's native date picker only
  // renders ค.ศ., so we draw our own grid: a readonly display shows the picked
  // date in พ.ศ., the popup lets the user click a day, and a hidden input keeps
  // the Gregorian "YYYY-MM-DD" value the rest of the form already expects.
  createThaiDateControl(field) {
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = field.name;
    hidden.value = Format.isoToDateInput(field.value);

    const wrap = document.createElement("div");
    wrap.className = "thai-date-control";

    const display = document.createElement("input");
    display.type = "text";
    display.readOnly = true;
    display.className = "thai-date-display";
    display.placeholder = "เลือกวันที่";
    display.setAttribute("aria-label", `${field.label || "วันที่"} (ปี พ.ศ.)`);

    const calendar = document.createElement("div");
    calendar.className = "thai-calendar";
    calendar.hidden = true;

    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const weekdayNames = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

    // Config years arrive in พ.ศ.; convert to the Gregorian range we navigate in.
    const currentThaiYear = new Date().getFullYear() + 543;
    const startBe = Math.max(1, Number(field.yearStart || 2460));
    const endBe = Math.max(startBe, Number(field.yearEnd || currentThaiYear + 10));
    const startYear = startBe - 543;
    const endYear = endBe - 543;

    const header = document.createElement("div");
    header.className = "thai-calendar-header";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "thai-calendar-nav";
    prevBtn.textContent = "‹";
    prevBtn.setAttribute("aria-label", "เดือนก่อนหน้า");
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "thai-calendar-nav";
    nextBtn.textContent = "›";
    nextBtn.setAttribute("aria-label", "เดือนถัดไป");

    const monthSelect = document.createElement("select");
    monthSelect.setAttribute("aria-label", "เดือน");
    for (let i = 0; i < 12; i += 1) {
      const option = document.createElement("option");
      option.value = String(i + 1);
      option.textContent = monthNames[i];
      monthSelect.appendChild(option);
    }
    const yearSelect = document.createElement("select");
    yearSelect.setAttribute("aria-label", "ปี พ.ศ.");
    for (let g = endYear; g >= startYear; g -= 1) {
      const option = document.createElement("option");
      option.value = String(g);
      option.textContent = String(g + 543); // show พ.ศ., store ค.ศ.
      yearSelect.appendChild(option);
    }
    header.append(prevBtn, monthSelect, yearSelect, nextBtn);

    const weekRow = document.createElement("div");
    weekRow.className = "thai-calendar-weekdays";
    for (const name of weekdayNames) {
      const cell = document.createElement("div");
      cell.className = "thai-calendar-weekday";
      cell.textContent = name;
      weekRow.appendChild(cell);
    }

    const grid = document.createElement("div");
    grid.className = "thai-calendar-grid";
    calendar.append(header, weekRow, grid);

    const today = new Date();
    const initial = Format.isoDateParts(field.value);
    const view = {
      year: initial ? initial.year : today.getFullYear(),
      month: initial ? initial.month : today.getMonth() + 1
    };
    view.year = Math.min(endYear, Math.max(startYear, view.year));

    const setDisplay = () => {
      display.value = hidden.value ? Format.formatDateCompact(hidden.value) : "";
    };

    const renderGrid = () => {
      monthSelect.value = String(view.month);
      yearSelect.value = String(view.year);
      grid.replaceChildren();
      const firstDow = new Date(view.year, view.month - 1, 1).getDay();
      const totalDays = new Date(view.year, view.month, 0).getDate();
      const selected = Format.isoDateParts(hidden.value);
      for (let i = 0; i < firstDow; i += 1) {
        const blank = document.createElement("div");
        blank.className = "thai-calendar-day is-blank";
        grid.appendChild(blank);
      }
      for (let d = 1; d <= totalDays; d += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "thai-calendar-day";
        cell.textContent = String(d);
        if (selected && selected.year === view.year && selected.month === view.month && selected.day === d) {
          cell.classList.add("is-selected");
        }
        if (view.year === today.getFullYear() && view.month === today.getMonth() + 1 && d === today.getDate()) {
          cell.classList.add("is-today");
        }
        cell.addEventListener("click", () => chooseDay(d));
        grid.appendChild(cell);
      }
    };

    let onDocPointer = null;
    const closeCalendar = () => {
      if (calendar.hidden) return;
      calendar.hidden = true;
      if (onDocPointer) {
        document.removeEventListener("pointerdown", onDocPointer, true);
        onDocPointer = null;
      }
    };
    const openCalendar = () => {
      if (!calendar.hidden) return;
      const selected = Format.isoDateParts(hidden.value);
      if (selected) {
        view.year = Math.min(endYear, Math.max(startYear, selected.year));
        view.month = selected.month;
      }
      renderGrid();
      calendar.hidden = false;
      onDocPointer = (event) => {
        if (!wrap.contains(event.target)) closeCalendar();
      };
      document.addEventListener("pointerdown", onDocPointer, true);
      calendar.scrollIntoView({ block: "nearest" });
    };

    function chooseDay(day) {
      hidden.value = `${String(view.year).padStart(4, "0")}-${String(view.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      setDisplay();
      closeCalendar();
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const stepMonth = (delta) => {
      let month = view.month + delta;
      let year = view.year;
      if (month < 1) {
        month = 12;
        year -= 1;
      } else if (month > 12) {
        month = 1;
        year += 1;
      }
      if (year < startYear || year > endYear) return;
      view.month = month;
      view.year = year;
      renderGrid();
    };

    prevBtn.addEventListener("click", () => stepMonth(-1));
    nextBtn.addEventListener("click", () => stepMonth(1));
    monthSelect.addEventListener("change", () => {
      view.month = Number(monthSelect.value);
      renderGrid();
    });
    yearSelect.addEventListener("change", () => {
      view.year = Number(yearSelect.value);
      renderGrid();
    });

    display.addEventListener("click", () => (calendar.hidden ? openCalendar() : closeCalendar()));
    display.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCalendar();
      } else if (event.key === "Escape") {
        closeCalendar();
      }
    });

    setDisplay();
    wrap.append(display, calendar, hidden);
    hidden._ltcVisibleElement = wrap;
    hidden._ltcFocusElement = display;
    return { control: hidden, element: wrap };
  }

  createImageControl(field) {
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = field.name;
    hidden.value = field.value == null ? "" : String(field.value);

    const picker = document.createElement("div");
    picker.className = "image-picker";

    const preview = document.createElement("img");
    preview.className = "image-picker-preview";
    preview.alt = field.label || "รูป";

    const placeholder = document.createElement("div");
    placeholder.className = "image-picker-placeholder";
    placeholder.textContent = "ยังไม่มีรูป";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn-soft";
    removeButton.textContent = "ลบรูป";

    const note = document.createElement("p");
    note.className = "image-picker-note";
    note.textContent = "รองรับไฟล์ PNG, JPEG, WebP · ระบบจะย่อขนาดรูปอัตโนมัติ";

    const paint = () => {
      const value = hidden.value;
      preview.hidden = !value;
      placeholder.hidden = Boolean(value);
      removeButton.disabled = !value;
      if (value) preview.src = value;
      else preview.removeAttribute("src");
    };

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        hidden.value = await this.compressImageFile(file);
        paint();
      } catch (error) {
        alert(error.message || "ไม่สามารถใช้รูปนี้ได้");
      } finally {
        fileInput.value = "";
      }
    });

    removeButton.addEventListener("click", () => {
      hidden.value = "";
      paint();
    });

    const actions = document.createElement("div");
    actions.className = "image-picker-actions";
    actions.appendChild(fileInput);
    actions.appendChild(removeButton);
    actions.appendChild(note);

    picker.appendChild(preview);
    picker.appendChild(placeholder);
    picker.appendChild(actions);
    picker.appendChild(hidden);
    paint();

    return { control: hidden, element: picker };
  }

  async openEntityDialog(config) {
    const { title, hint, fields } = config;

    this.el.entityDialogTitle.textContent = title;
    this.el.entityDialogHint.textContent = hint || "";
    this.el.entityFormFields.innerHTML = "";

    const controls = {};

    for (const field of fields) {
      if (field.hidden) continue;

      const wrap = document.createElement("div");
      const fieldClasses = ["row-field"];
      if (field.wide) fieldClasses.push("wide");
      if (field.type === "date") fieldClasses.push("date-field");
      wrap.className = fieldClasses.join(" ");

      const label = document.createElement("label");
      label.innerHTML = `${Format.escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ""}`;
      wrap.appendChild(label);

      let control;
      let controlElement = null;
      if (field.type === "select") {
        control = document.createElement("select");

        if (!field.required) {
          const option = document.createElement("option");
          option.value = "";
          option.textContent = "-";
          control.appendChild(option);
        }

        for (const optionData of field.options || []) {
          const option = document.createElement("option");
          if (typeof optionData === "object") {
            option.value = optionData.value;
            option.textContent = optionData.label;
          } else {
            option.value = String(optionData);
            option.textContent = String(optionData);
          }
          control.appendChild(option);
        }

        control.value = field.value == null ? "" : String(field.value);
      } else if (field.type === "textarea") {
        control = document.createElement("textarea");
        control.value = field.value == null ? "" : String(field.value);
      } else if (field.type === "image") {
        const imageControl = this.createImageControl(field);
        control = imageControl.control;
        controlElement = imageControl.element;
      } else if (field.type === "date") {
        const dateControl = this.createThaiDateControl(field);
        control = dateControl.control;
        controlElement = dateControl.element;
      } else {
        control = document.createElement("input");
        control.type =
          field.type === "number"
              ? "number"
              : field.type === "password"
                ? "password"
                : "text";
        control.value = field.value == null ? "" : String(field.value);
        if (field.type === "password") {
          control.autocomplete = "new-password";
        }

        if (field.min != null) control.min = String(field.min);
        if (field.max != null) control.max = String(field.max);
        if (field.step != null) control.step = String(field.step);
      }

      if (field.placeholder) control.placeholder = field.placeholder;
      if (field.required) control.required = true;

      control.name = field.name;
      controls[field.name] = control;
      wrap.appendChild(controlElement || control);

      if (field.help) {
        const help = document.createElement("small");
        help.textContent = field.help;
        wrap.appendChild(help);
      }

      this.el.entityFormFields.appendChild(wrap);
    }

    if (typeof config.afterRender === "function") {
      config.afterRender(controls);
    }

    return new Promise((resolve) => {
      const cleanup = () => {
        this.el.entityForm.removeEventListener("submit", onSubmit);
        this.el.entityCancelBtn.removeEventListener("click", onCancel);
        this.el.entityDialog.removeEventListener("close", onClose);
      };

      const onClose = () => {
        cleanup();
        resolve(null);
      };

      const onCancel = () => {
        this.el.entityDialog.close();
      };

      const onSubmit = (event) => {
        event.preventDefault();

        const rawValues = {};
        for (const field of fields) {
          if (field.hidden) continue;
          const control = controls[field.name];
          rawValues[field.name] = control.value;
        }

        // Bring the offending field into view (the form scrolls as one container,
        // so a failing field may be scrolled off-screen) then focus it, so the
        // user always sees which field blocked saving.
        const revealField = (name) => {
          const control = controls[name];
          if (!control) return;
          const visibleElement = control._ltcVisibleElement || control;
          try {
            visibleElement.scrollIntoView({ block: "center", behavior: "auto" });
          } catch {
            // older engines: focus() below still scrolls it into view
          }
          (control._ltcFocusElement || control).focus({ preventScroll: true });
        };

        for (const field of fields) {
          if (field.hidden) continue;
          const value = Format.toText(rawValues[field.name]);
          if (field.required && !value) {
            alert(`กรุณากรอก ${field.label}`);
            revealField(field.name);
            return;
          }

          if (typeof field.validate === "function") {
            const error = field.validate(rawValues[field.name], rawValues);
            if (error) {
              alert(error);
              revealField(field.name);
              return;
            }
          }
        }

        const parsed = {};
        for (const field of fields) {
          if (field.hidden) continue;

          const raw = rawValues[field.name];
          let value = raw;
          if (field.type === "number") {
            value = raw === "" ? 0 : Number(raw);
          } else if (field.type === "date") {
            value = Format.dateInputToIso(raw);
          } else {
            value = Format.cleanWhitespace(raw);
            if (!value) value = null;
          }

          parsed[field.name] = value;
        }

        cleanup();
        this.el.entityDialog.close();
        resolve(parsed);
      };

      this.el.entityForm.addEventListener("submit", onSubmit);
      this.el.entityCancelBtn.addEventListener("click", onCancel);
      this.el.entityDialog.addEventListener("close", onClose);
      this.el.entityDialog.showModal();
    });
  }
}

export { EntityDialogService, financeCategoryView };
