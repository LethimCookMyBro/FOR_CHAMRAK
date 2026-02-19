import { Format, Validate, NameUtils } from "./utils.js";

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
      careEnd: row?.["วันสิ้นสุด cp"] || null
    };

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มผู้รับบริการ LTC" : "แก้ไขผู้รับบริการ LTC",
      hint: "กรอกข้อมูลสำคัญที่ใช้จริงในหน้างาน ข้อมูลจะเชื่อมกับภาพรวมทันที",
      fields: [
        {
          name: "citizenId",
          label: "เลขบัตรประชาชน",
          type: "text",
          required: true,
          value: initial.citizenId,
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
          type: "select",
          required: true,
          value: initial.unitCode,
          options: unitRows.map((unit) => ({
            value: unit["รหัสหน่วย"] || "",
            label: `${unit["รหัสหน่วย"] || "-"} - ${unit["หน่วย"] || "-"}`
          }))
        },
        {
          name: "cmCode",
          label: "รหัส CM",
          type: "select",
          value: initial.cmCode,
          options: cmRows.map((cm) => ({
            value: cm["รหัสcm"] || "",
            label: `${cm["รหัสcm"] || "-"} - ${Format.expandFemalePrefixInText(cm["ชื่อสกุล"] || "-")}`
          }))
        },
        {
          name: "cgCode",
          label: "รหัส CG",
          type: "select",
          value: initial.cgCode,
          options: cgRows.map((cg) => ({
            value: cg["รหัสcg"] || "",
            label: `${cg["รหัสcg"] || "-"} - ${Format.expandFemalePrefixInText(cg["ชื่อสกุล"] || "-")}`
          }))
        },
        { name: "careStart", label: "วันเริ่ม Care Plan", type: "date", value: initial.careStart },
        { name: "careEnd", label: "วันสิ้นสุด Care Plan", type: "date", value: initial.careEnd }
      ]
    });
  }

  async openCgDialog(mode, row = null) {
    const cmRows = await this.repo.getTable("t02_cm");
    const parsedName = NameUtils.parse(row?.["ชื่อสกุล"] || "");

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่ม Care Giver (CG)" : "แก้ไข Care Giver (CG)",
      hint: "คำนำหน้าผู้หญิงจะแสดงเป็น 'นางสาว' เสมอ",
      fields: [
        {
          name: "cgCode",
          label: "รหัส CG",
          type: "text",
          value: row?.["รหัสcg"] || "",
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
          label: "รหัส CM",
          type: "select",
          required: true,
          value: row?.["รหัสcm"] || "",
          options: cmRows.map((cm) => ({
            value: cm["รหัสcm"] || "",
            label: `${cm["รหัสcm"] || "-"} - ${Format.expandFemalePrefixInText(cm["ชื่อสกุล"] || "-")}`
          }))
        }
      ]
    });
  }

  async openCmDialog(mode, row = null) {
    const unitRows = await this.repo.getTable("t26_unit");
    const parsedName = NameUtils.parse(row?.["ชื่อสกุล"] || "");

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่ม Care Manager (CM)" : "แก้ไข Care Manager (CM)",
      hint: "แก้ไขรหัส CM ได้ โดยระบบจะอัปเดตรหัสที่เชื่อมอยู่ให้อัตโนมัติ",
      fields: [
        {
          name: "cmCode",
          label: "รหัส CM",
          type: "text",
          value: row?.["รหัสcm"] || "",
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
          type: "select",
          required: true,
          value: row?.["รหัสหน่วย"] || "",
          options: unitRows.map((unit) => ({
            value: unit["รหัสหน่วย"] || "",
            label: `${unit["รหัสหน่วย"] || "-"} - ${unit["หน่วย"] || "-"}`
          }))
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
        { name: "productID", label: "รหัสวัสดุ", type: "text", required: true, value: row?.productID || "" },
        { name: "productName", label: "ชื่อวัสดุ", type: "text", required: true, value: row?.productName || "" },
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
        },
        {
          name: "reorderPoint",
          label: "จุดสั่งซื้อขั้นต่ำ",
          type: "number",
          required: true,
          value: Number(row?.reorderPoint ?? row?.threshold ?? 10),
          min: 0,
          validate: (value) => (Validate.nonNegative(value) ? null : "ค่าจุดสั่งซื้อต้องไม่ติดลบ")
        }
      ]
    });
  }

  async openSupplyMovementDialog(mode, productRow) {
    const isIn = mode === "in";
    return this.openEntityDialog({
      title: isIn ? "รับเข้าวัสดุ (+)" : "เบิกจ่ายวัสดุ (-)",
      hint: `${productRow.productName || "-"} (${productRow.productID || "-"})`,
      fields: [
        {
          name: "date",
          label: "วันที่",
          type: "date",
          required: true,
          value: Format.todayDateInput()
        },
        {
          name: "quantity",
          label: "จำนวน",
          type: "number",
          required: true,
          value: 1,
          min: 1,
          validate: (value) => (Validate.positive(value) ? null : "จำนวนต้องมากกว่า 0")
        },
        {
          name: "reference",
          label: "เลขอ้างอิง",
          type: "text",
          required: true,
          value: ""
        },
        {
          name: "note",
          label: "หมายเหตุ",
          type: "textarea",
          wide: true,
          value: ""
        }
      ]
    });
  }

  async openFinanceDialog(mode, parsed = null) {
    const todayYear = new Date().getFullYear() + 543;
    const type = parsed?.type === "income" || parsed?.type === "expense" ? parsed.type : "income";
    const category = parsed?.category && parsed.category !== "-" ? Number(parsed.category) : 1;
    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มรายการการเงิน" : "แก้ไขรายการการเงิน",
      hint: "เลือกประเภทเป็นรายรับหรือรายจ่าย แล้วระบบจะสรุปยอดให้ทันที",
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
          options: [
            { value: "income", label: "รายรับ" },
            { value: "expense", label: "รายจ่าย" }
          ]
        },
        {
          name: "category",
          label: "หมวด (1-4)",
          type: "select",
          required: true,
          value: String(category),
          options: [
            { value: "1", label: "ประเภท 1" },
            { value: "2", label: "ประเภท 2" },
            { value: "3", label: "ประเภท 3" },
            { value: "4", label: "ประเภท 4" }
          ]
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
      ]
    });
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

  async openEntityDialog(config) {
    const { title, hint, fields } = config;

    this.el.entityDialogTitle.textContent = title;
    this.el.entityDialogHint.textContent = hint || "";
    this.el.entityFormFields.innerHTML = "";

    const controls = {};

    for (const field of fields) {
      if (field.hidden) continue;

      const wrap = document.createElement("div");
      wrap.className = `row-field${field.wide ? " wide" : ""}`;

      const label = document.createElement("label");
      label.innerHTML = `${Format.escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ""}`;
      wrap.appendChild(label);

      let control;
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
      } else {
        control = document.createElement("input");
        control.type =
          field.type === "date"
            ? "date"
            : field.type === "number"
              ? "number"
              : field.type === "password"
                ? "password"
                : "text";
        if (field.type === "date") {
          control.value = Format.isoToDateInput(field.value);
        } else {
          control.value = field.value == null ? "" : String(field.value);
        }
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
      wrap.appendChild(control);

      if (field.help) {
        const help = document.createElement("small");
        help.textContent = field.help;
        wrap.appendChild(help);
      }

      this.el.entityFormFields.appendChild(wrap);
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

        for (const field of fields) {
          if (field.hidden) continue;
          const value = Format.toText(rawValues[field.name]);
          if (field.required && !value) {
            alert(`กรุณากรอก ${field.label}`);
            controls[field.name].focus();
            return;
          }

          if (typeof field.validate === "function") {
            const error = field.validate(rawValues[field.name], rawValues);
            if (error) {
              alert(error);
              controls[field.name].focus();
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

export { EntityDialogService };
