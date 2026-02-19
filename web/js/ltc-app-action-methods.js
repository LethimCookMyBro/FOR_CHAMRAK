import { Format, NameUtils } from "./utils.js";

class LtcAppActionMethodCarrier {
  async handleAddDependent() {
    await this.runProtected("เพิ่มผู้รับบริการ", async () => {
      const rows = await this.repo.cloneTable("t04_dataj");
      const form = await this.dialogs.openDependentDialog("add");
      if (!form) return;

      const duplicated = rows.some((row) => String(row["เลขประชาชน"] || "") === form.citizenId);
      if (duplicated) throw new Error("เลขประชาชนนี้มีอยู่ในระบบแล้ว");

      const newRow = {
        __rowid: this.repo.createRowId("t04_dataj"),
        ID: this.repo.getNextNumeric(rows, "ID"),
        "เลขประชาชน": form.citizenId,
        "นาม": Format.normalizeFemalePrefix(form.prefix),
        "ชื่อ": form.firstName,
        "สกุล": form.lastName,
        ADL: Number(form.adl),
        TAI: String(form.tai || "").toUpperCase(),
        "วันเดือนปีเกิด": form.birthDate,
        "เพศ": form.gender,
        "สถานะ": false,
        "วันที่เสียชีวิต": null,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ถนน": form.road,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัสหน่วย": form.unitCode,
        "รหัสcm": form.cmCode,
        "รหัสcg": form.cgCode,
        "วันเริ่ม cp": form.careStart,
        "วันสิ้นสุด cp": form.careEnd,
        G: this.domain.getTaiGroup(form.tai)
      };

      rows.push(newRow);
      await this.repo.saveTable("t04_dataj", rows);
      this.state.selected.dependents = newRow.__rowid;
    });
  }

  async handleEditDependent() {
    await this.runProtected("แก้ไขผู้รับบริการ", async () => {
      const selected = await this.getSelectedRow("t04_dataj", "dependents");
      if (!selected) {
        alert("กรุณาเลือกแถวผู้รับบริการก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t04_dataj");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const form = await this.dialogs.openDependentDialog("edit", rows[index]);
      if (!form) return;

      const duplicated = rows.some(
        (row, rowIndex) => rowIndex !== index && String(row["เลขประชาชน"] || "") === form.citizenId
      );
      if (duplicated) throw new Error("เลขประชาชนนี้ซ้ำกับข้อมูลอื่น");

      rows[index] = {
        ...rows[index],
        "เลขประชาชน": form.citizenId,
        "นาม": Format.normalizeFemalePrefix(form.prefix),
        "ชื่อ": form.firstName,
        "สกุล": form.lastName,
        ADL: Number(form.adl),
        TAI: String(form.tai || "").toUpperCase(),
        "วันเดือนปีเกิด": form.birthDate,
        "เพศ": form.gender,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ถนน": form.road,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัสหน่วย": form.unitCode,
        "รหัสcm": form.cmCode,
        "รหัสcg": form.cgCode,
        "วันเริ่ม cp": form.careStart,
        "วันสิ้นสุด cp": form.careEnd,
        G: this.domain.getTaiGroup(form.tai)
      };

      await this.repo.saveTable("t04_dataj", rows);
    });
  }

  async handleDeleteDependent() {
    await this.runProtected("ลบผู้รับบริการ", async () => {
      const selected = await this.getSelectedRow("t04_dataj", "dependents");
      if (!selected) {
        alert("กรุณาเลือกแถวผู้รับบริการก่อน");
        return;
      }

      if (!confirm("ยืนยันการลบผู้รับบริการที่เลือก?")) return;

      await this.repo.deleteRows("t04_dataj", [selected.__rowid]);
      this.state.selected.dependents = null;
      this.getCheckedSet("dependents").delete(selected.__rowid);
    });
  }

  async handleDeleteDependentBatch() {
    await this.runProtected("ลบผู้รับบริการหลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("dependents")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือกผู้รับบริการที่ต้องการลบ");
        return;
      }
      if (!confirm(`ยืนยันการลบผู้รับบริการ ${rowIds.length} รายการ?`)) return;

      const idSet = new Set(rowIds);
      await this.repo.deleteRows("t04_dataj", rowIds);
      this.clearChecked("dependents");
      if (this.state.selected.dependents && idSet.has(this.state.selected.dependents)) {
        this.state.selected.dependents = null;
      }
    });
  }

  async handleAddCg() {
    await this.runProtected("เพิ่ม CG", async () => {
      const rows = await this.repo.cloneTable("t01_cg");
      const form = await this.dialogs.openCgDialog("add");
      if (!form) return;

      const generatedCode = form.cgCode || this.generateCgCode(form.cmCode, rows);
      const duplicated = rows.some((row) => String(row["รหัสcg"] || "") === generatedCode);
      if (duplicated) throw new Error("รหัส CG ซ้ำในระบบ");

      const newRow = {
        __rowid: this.repo.createRowId("t01_cg"),
        ID: this.repo.getNextNumeric(rows, "ID"),
        "รหัสcg": generatedCode,
        "ชื่อสกุล": NameUtils.compose(form.prefix, form.firstName, form.lastName, true),
        "วดปเกิด": form.birthDate,
        "โทร": form.phone,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัสcm": form.cmCode
      };

      rows.push(newRow);
      await this.repo.saveTable("t01_cg", rows);
      this.state.selected.cg = newRow.__rowid;
    });
  }

  async handleEditCg() {
    await this.runProtected("แก้ไข CG", async () => {
      const selected = await this.getSelectedRow("t01_cg", "cg");
      if (!selected) {
        alert("กรุณาเลือกแถว CG ก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t01_cg");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const oldCode = String(rows[index]["รหัสcg"] || "");
      const form = await this.dialogs.openCgDialog("edit", rows[index]);
      if (!form) return;

      const newCode = form.cgCode || oldCode;
      const duplicated = rows.some((row, rowIndex) => rowIndex !== index && String(row["รหัสcg"] || "") === newCode);
      if (duplicated) throw new Error("รหัส CG ซ้ำในระบบ");

      rows[index] = {
        ...rows[index],
        "รหัสcg": newCode,
        "ชื่อสกุล": NameUtils.compose(form.prefix, form.firstName, form.lastName, true),
        "วดปเกิด": form.birthDate,
        "โทร": form.phone,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัสcm": form.cmCode
      };

      await this.repo.saveTable("t01_cg", rows);

      if (oldCode !== newCode) {
        const dependentRows = await this.repo.cloneTable("t04_dataj");
        let changed = false;
        for (const row of dependentRows) {
          if (String(row["รหัสcg"] || "") === oldCode) {
            row["รหัสcg"] = newCode;
            changed = true;
          }
        }
        if (changed) await this.repo.saveTable("t04_dataj", dependentRows);
      }
    });
  }

  async handleDeleteCg() {
    await this.runProtected("ลบ CG", async () => {
      const selected = await this.getSelectedRow("t01_cg", "cg");
      if (!selected) {
        alert("กรุณาเลือกแถว CG ก่อน");
        return;
      }

      const cgCode = String(selected["รหัสcg"] || "");
      const dependentRows = await this.repo.getTable("t04_dataj");
      const linked = dependentRows.filter((row) => String(row["รหัสcg"] || "") === cgCode).length;
      if (linked > 0) {
        throw new Error(`ลบไม่ได้: มีผู้รับบริการเชื่อมกับรหัส CG นี้อยู่ ${linked} ราย`);
      }

      if (!confirm("ยืนยันการลบ CG ที่เลือก?")) return;

      await this.repo.deleteRows("t01_cg", [selected.__rowid]);
      this.state.selected.cg = null;
      this.getCheckedSet("cg").delete(selected.__rowid);
    });
  }

  async handleDeleteCgBatch() {
    await this.runProtected("ลบ CG หลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("cg")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือก CG ที่ต้องการลบ");
        return;
      }

      const rows = await this.repo.cloneTable("t01_cg");
      const selectedRows = rows.filter((row) => rowIds.includes(row.__rowid));
      if (!selectedRows.length) return;

      const dependentRows = await this.repo.getTable("t04_dataj");
      const blockedCodes = selectedRows
        .map((row) => String(row["รหัสcg"] || ""))
        .filter((cgCode) => dependentRows.some((dep) => String(dep["รหัสcg"] || "") === cgCode));
      if (blockedCodes.length) {
        throw new Error(`ลบไม่ได้: มีผู้รับบริการเชื่อมกับ CG (${blockedCodes.join(", ")})`);
      }

      if (!confirm(`ยืนยันการลบ CG ${selectedRows.length} รายการ?`)) return;

      const idSet = new Set(rowIds);
      await this.repo.deleteRows("t01_cg", rowIds);
      this.clearChecked("cg");
      if (this.state.selected.cg && idSet.has(this.state.selected.cg)) {
        this.state.selected.cg = null;
      }
    });
  }

  async handleAddCm() {
    await this.runProtected("เพิ่ม CM", async () => {
      const rows = await this.repo.cloneTable("t02_cm");
      const form = await this.dialogs.openCmDialog("add");
      if (!form) return;

      const generatedCode = form.cmCode || this.generateCmCode(form.unitCode, rows);
      const duplicated = rows.some((row) => String(row["รหัสcm"] || "") === generatedCode);
      if (duplicated) throw new Error("รหัส CM ซ้ำในระบบ");

      const newRow = {
        __rowid: this.repo.createRowId("t02_cm"),
        ID: this.repo.getNextNumeric(rows, "ID"),
        "รหัสcm": generatedCode,
        "ชื่อสกุล": NameUtils.compose(form.prefix, form.firstName, form.lastName, true),
        "รหัสหน่วย": form.unitCode,
        "โทร": form.phone,
        "วดปเกิด": form.birthDate,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province
      };

      rows.push(newRow);
      await this.repo.saveTable("t02_cm", rows);
      this.state.selected.cm = newRow.__rowid;
    });
  }

  async handleEditCm() {
    await this.runProtected("แก้ไข CM", async () => {
      const selected = await this.getSelectedRow("t02_cm", "cm");
      if (!selected) {
        alert("กรุณาเลือกแถว CM ก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t02_cm");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const oldCode = String(rows[index]["รหัสcm"] || "");
      const form = await this.dialogs.openCmDialog("edit", rows[index]);
      if (!form) return;

      const newCode = form.cmCode || oldCode;
      const duplicated = rows.some((row, rowIndex) => rowIndex !== index && String(row["รหัสcm"] || "") === newCode);
      if (duplicated) throw new Error("รหัส CM ซ้ำในระบบ");

      rows[index] = {
        ...rows[index],
        "รหัสcm": newCode,
        "ชื่อสกุล": NameUtils.compose(form.prefix, form.firstName, form.lastName, true),
        "รหัสหน่วย": form.unitCode,
        "โทร": form.phone,
        "วดปเกิด": form.birthDate,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province
      };

      await this.repo.saveTable("t02_cm", rows);

      if (oldCode !== newCode) {
        const [dependentRows, cgRows] = await Promise.all([
          this.repo.cloneTable("t04_dataj"),
          this.repo.cloneTable("t01_cg")
        ]);

        let dependentChanged = false;
        for (const row of dependentRows) {
          if (String(row["รหัสcm"] || "") === oldCode) {
            row["รหัสcm"] = newCode;
            dependentChanged = true;
          }
        }

        let cgChanged = false;
        for (const row of cgRows) {
          if (String(row["รหัสcm"] || "") === oldCode) {
            row["รหัสcm"] = newCode;
            cgChanged = true;
          }
        }

        if (dependentChanged) await this.repo.saveTable("t04_dataj", dependentRows);
        if (cgChanged) await this.repo.saveTable("t01_cg", cgRows);
      }
    });
  }

  async handleDeleteCm() {
    await this.runProtected("ลบ CM", async () => {
      const selected = await this.getSelectedRow("t02_cm", "cm");
      if (!selected) {
        alert("กรุณาเลือกแถว CM ก่อน");
        return;
      }

      const cmCode = String(selected["รหัสcm"] || "");
      const [dependentRows, cgRows] = await Promise.all([
        this.repo.getTable("t04_dataj"),
        this.repo.getTable("t01_cg")
      ]);

      const linkedDependents = dependentRows.filter((row) => String(row["รหัสcm"] || "") === cmCode).length;
      const linkedCgs = cgRows.filter((row) => String(row["รหัสcm"] || "") === cmCode).length;

      if (linkedDependents > 0 || linkedCgs > 0) {
        throw new Error(`ลบไม่ได้: มีข้อมูลเชื่อมอยู่ (ผู้รับบริการ ${linkedDependents} ราย, CG ${linkedCgs} คน)`);
      }

      if (!confirm("ยืนยันการลบ CM ที่เลือก?")) return;

      await this.repo.deleteRows("t02_cm", [selected.__rowid]);
      this.state.selected.cm = null;
      this.getCheckedSet("cm").delete(selected.__rowid);
    });
  }

  async handleDeleteCmBatch() {
    await this.runProtected("ลบ CM หลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("cm")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือก CM ที่ต้องการลบ");
        return;
      }

      const rows = await this.repo.cloneTable("t02_cm");
      const selectedRows = rows.filter((row) => rowIds.includes(row.__rowid));
      if (!selectedRows.length) return;

      const cmCodeSet = new Set(selectedRows.map((row) => String(row["รหัสcm"] || "")));
      const [dependentRows, cgRows] = await Promise.all([
        this.repo.getTable("t04_dataj"),
        this.repo.getTable("t01_cg")
      ]);
      const linkedDependents = dependentRows.filter((row) => cmCodeSet.has(String(row["รหัสcm"] || ""))).length;
      const linkedCgs = cgRows.filter((row) => cmCodeSet.has(String(row["รหัสcm"] || ""))).length;
      if (linkedDependents > 0 || linkedCgs > 0) {
        throw new Error(`ลบไม่ได้: มีข้อมูลเชื่อมอยู่ (ผู้รับบริการ ${linkedDependents} ราย, CG ${linkedCgs} คน)`);
      }

      if (!confirm(`ยืนยันการลบ CM ${selectedRows.length} รายการ?`)) return;

      const idSet = new Set(rowIds);
      await this.repo.deleteRows("t02_cm", rowIds);
      this.clearChecked("cm");
      if (this.state.selected.cm && idSet.has(this.state.selected.cm)) {
        this.state.selected.cm = null;
      }
    });
  }

  async handleEditCmRate(rowId, groupKey = "") {
    await this.runProtected("แก้ไขอัตราการดูแลและค่าตอบแทน CM", async () => {
      const rows = await this.repo.cloneTable("t07_gro");
      const safeRowId = String(rowId || "");
      const safeGroupKey = String(groupKey || "");

      const index = rows.findIndex((row) => {
        if (safeRowId && String(row.__rowid || "") === safeRowId) return true;
        if (safeGroupKey && String(row.Group || "") === safeGroupKey) return true;
        return false;
      });
      if (index < 0) {
        alert("ไม่พบข้อมูลอัตราการดูแลกลุ่มที่เลือก");
        return;
      }

      const form = await this.dialogs.openCmRateDialog(rows[index]);
      if (!form) return;

      rows[index] = {
        ...rows[index],
        number: Number(form.visitsPerYear),
        rateCm: Number(form.rateCm)
      };

      await this.repo.saveTable("t07_gro", rows);
    });
  }

  async handleAddProduct() {
    await this.runProtected("เพิ่มวัสดุ", async () => {
      const rows = await this.repo.cloneTable("t16_product");
      const form = await this.dialogs.openProductDialog("add");
      if (!form) return;

      const duplicated = rows.some((row) => String(row.productID || "") === form.productID);
      if (duplicated) throw new Error("รหัสวัสดุซ้ำในระบบ");

      const newRow = {
        __rowid: this.repo.createRowId("t16_product"),
        id: this.repo.getNextNumeric(rows, "id"),
        productID: form.productID,
        productName: form.productName,
        price: Number(form.price),
        unit: form.unit,
        reorderPoint: Number(form.reorderPoint)
      };

      rows.push(newRow);
      await this.repo.saveTable("t16_product", rows);
      this.state.selected.supplies = newRow.__rowid;
    });
  }

  async handleEditProduct() {
    await this.runProtected("แก้ไขวัสดุ", async () => {
      const selected = await this.getSelectedProductRow();
      if (!selected) {
        alert("กรุณาเลือกวัสดุก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t16_product");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const oldProductId = String(rows[index].productID || "");
      const form = await this.dialogs.openProductDialog("edit", rows[index]);
      if (!form) return;

      const duplicated = rows.some((row, rowIndex) => rowIndex !== index && String(row.productID || "") === form.productID);
      if (duplicated) throw new Error("รหัสวัสดุซ้ำในระบบ");

      rows[index] = {
        ...rows[index],
        productID: form.productID,
        productName: form.productName,
        price: Number(form.price),
        unit: form.unit,
        reorderPoint: Number(form.reorderPoint)
      };

      await this.repo.saveTable("t16_product", rows);

      const newProductId = form.productID;
      if (oldProductId !== newProductId) {
        const [inRows, outRows] = await Promise.all([
          this.repo.cloneTable("t09_intproduct"),
          this.repo.cloneTable("t13_outproduct")
        ]);

        let inChanged = false;
        for (const row of inRows) {
          if (String(row.productID || "") === oldProductId) {
            row.productID = newProductId;
            inChanged = true;
          }
        }

        let outChanged = false;
        for (const row of outRows) {
          if (String(row.productID || "") === oldProductId) {
            row.productID = newProductId;
            outChanged = true;
          }
        }

        if (inChanged) await this.repo.saveTable("t09_intproduct", inRows);
        if (outChanged) await this.repo.saveTable("t13_outproduct", outRows);
      }
    });
  }

  async handleDeleteProduct() {
    await this.runProtected("ลบวัสดุ", async () => {
      const selected = await this.getSelectedProductRow();
      if (!selected) {
        alert("กรุณาเลือกวัสดุก่อน");
        return;
      }

      const productId = String(selected.productID || "");
      const [inRows, outRows] = await Promise.all([
        this.repo.cloneTable("t09_intproduct"),
        this.repo.cloneTable("t13_outproduct")
      ]);

      const inCount = inRows.filter((row) => String(row.productID || "") === productId).length;
      const outCount = outRows.filter((row) => String(row.productID || "") === productId).length;

      if (inCount > 0 || outCount > 0) {
        const cascade = confirm(
          `วัสดุนี้มีประวัติรับเข้า/เบิกจ่าย (${inCount + outCount} รายการ)\nต้องการลบพร้อมประวัติทั้งหมดหรือไม่?`
        );
        if (!cascade) return;
      } else if (!confirm("ยืนยันการลบวัสดุที่เลือก?")) {
        return;
      }

      const inDeleteIds = inRows.filter((row) => String(row.productID || "") === productId).map((row) => row.__rowid);
      const outDeleteIds = outRows.filter((row) => String(row.productID || "") === productId).map((row) => row.__rowid);

      await Promise.all([
        this.repo.deleteRows("t16_product", [selected.__rowid]),
        inDeleteIds.length ? this.repo.deleteRows("t09_intproduct", inDeleteIds) : Promise.resolve(),
        outDeleteIds.length ? this.repo.deleteRows("t13_outproduct", outDeleteIds) : Promise.resolve()
      ]);

      this.state.selected.supplies = null;
      this.getCheckedSet("supplies").delete(selected.__rowid);
    });
  }

  async handleDeleteProductBatch() {
    await this.runProtected("ลบวัสดุหลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("supplies")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือกวัสดุที่ต้องการลบ");
        return;
      }

      const [productRows, inRows, outRows] = await Promise.all([
        this.repo.cloneTable("t16_product"),
        this.repo.cloneTable("t09_intproduct"),
        this.repo.cloneTable("t13_outproduct")
      ]);
      const selectedProducts = productRows.filter((row) => rowIds.includes(row.__rowid));
      if (!selectedProducts.length) return;

      const productCodeSet = new Set(selectedProducts.map((row) => String(row.productID || "")));
      const movementCount =
        inRows.filter((row) => productCodeSet.has(String(row.productID || ""))).length +
        outRows.filter((row) => productCodeSet.has(String(row.productID || ""))).length;

      if (movementCount > 0) {
        const cascade = confirm(
          `วัสดุที่เลือกมีประวัติรับเข้า/เบิกจ่าย ${movementCount} รายการ\nต้องการลบพร้อมประวัติทั้งหมดหรือไม่?`
        );
        if (!cascade) return;
      } else if (!confirm(`ยืนยันการลบวัสดุ ${selectedProducts.length} รายการ?`)) {
        return;
      }

      const rowIdSet = new Set(rowIds);
      const inDeleteIds = inRows
        .filter((row) => productCodeSet.has(String(row.productID || "")))
        .map((row) => row.__rowid);
      const outDeleteIds = outRows
        .filter((row) => productCodeSet.has(String(row.productID || "")))
        .map((row) => row.__rowid);

      await Promise.all([
        this.repo.deleteRows("t16_product", rowIds),
        inDeleteIds.length ? this.repo.deleteRows("t09_intproduct", inDeleteIds) : Promise.resolve(),
        outDeleteIds.length ? this.repo.deleteRows("t13_outproduct", outDeleteIds) : Promise.resolve()
      ]);

      this.clearChecked("supplies");
      if (this.state.selected.supplies && rowIdSet.has(this.state.selected.supplies)) {
        this.state.selected.supplies = null;
      }
    });
  }

  async handleSupplyIn() {
    await this.runProtected("บันทึกรับเข้า", async () => {
      const selected = await this.getSelectedProductRow();
      if (!selected) {
        alert("กรุณาเลือกวัสดุก่อน");
        return;
      }

      const form = await this.dialogs.openSupplyMovementDialog("in", selected);
      if (!form) return;

      const rows = await this.repo.cloneTable("t09_intproduct");
      const newRow = {
        __rowid: this.repo.createRowId("t09_intproduct"),
        inno: this.repo.getNextNumeric(rows, "inno"),
        indate: form.date,
        intype: form.typeCode,
        productID: selected.productID,
        quantity: Number(form.quantity)
      };

      rows.push(newRow);
      await this.repo.saveTable("t09_intproduct", rows);
    });
  }

  async handleSupplyOut() {
    await this.runProtected("บันทึกเบิกจ่าย", async () => {
      const selected = await this.getSelectedProductInventory();
      if (!selected) {
        alert("กรุณาเลือกวัสดุก่อน");
        return;
      }

      const form = await this.dialogs.openSupplyMovementDialog("out", selected.product);
      if (!form) return;

      const quantity = Number(form.quantity);
      if (quantity > selected.balance) {
        throw new Error(`จำนวนเบิกจ่ายเกินคงเหลือ (คงเหลือ ${selected.balance})`);
      }

      const rows = await this.repo.cloneTable("t13_outproduct");
      const newRow = {
        __rowid: this.repo.createRowId("t13_outproduct"),
        outno: this.repo.getNextNumeric(rows, "outno"),
        outdate: form.date,
        outtype: form.typeCode,
        productID: selected.productID,
        quantity,
        "รหัสltc": form.ltcCode,
        Returndate: null,
        round: form.round
      };

      rows.push(newRow);
      await this.repo.saveTable("t13_outproduct", rows);
    });
  }

  async handleAddFinance() {
    await this.runProtected("เพิ่มรายการการเงิน", async () => {
      const rows = await this.repo.cloneTable("t23_tbl_income_expense");
      const form = await this.dialogs.openFinanceDialog("add");
      if (!form) return;

      const newRow = this.domain.buildFinanceRow(form, {}, this.repo.getNextNumeric(rows, "ID"));
      newRow.__rowid = this.repo.createRowId("t23_tbl_income_expense");

      rows.push(newRow);
      await this.repo.saveTable("t23_tbl_income_expense", rows);
      this.state.selected.finance = newRow.__rowid;
    });
  }

  async handleEditFinance() {
    await this.runProtected("แก้ไขรายการการเงิน", async () => {
      const selected = await this.getSelectedRow("t23_tbl_income_expense", "finance");
      if (!selected) {
        alert("กรุณาเลือกรายการการเงินก่อน");
        return;
      }

      const parsed = this.domain.parseFinanceRow(selected);
      if (!parsed.editable) {
        throw new Error("รายการนี้แก้ไขแบบฟอร์มง่ายไม่ได้ (มีข้อมูลผสมหลายช่อง) ให้ลบแล้วเพิ่มใหม่");
      }

      const rows = await this.repo.cloneTable("t23_tbl_income_expense");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const form = await this.dialogs.openFinanceDialog("edit", parsed);
      if (!form) return;

      const updated = this.domain.buildFinanceRow(form, rows[index], rows[index].ID || this.repo.getNextNumeric(rows, "ID"));
      updated.__rowid = rows[index].__rowid;
      rows[index] = updated;

      await this.repo.saveTable("t23_tbl_income_expense", rows);
    });
  }

  async handleDeleteFinance() {
    await this.runProtected("ลบรายการการเงิน", async () => {
      const selected = await this.getSelectedRow("t23_tbl_income_expense", "finance");
      if (!selected) {
        alert("กรุณาเลือกรายการการเงินก่อน");
        return;
      }

      if (!confirm("ยืนยันการลบรายการการเงินที่เลือก?")) return;

      await this.repo.deleteRows("t23_tbl_income_expense", [selected.__rowid]);
      this.state.selected.finance = null;
      this.getCheckedSet("finance").delete(selected.__rowid);
    });
  }

  async handleDeleteFinanceBatch() {
    await this.runProtected("ลบรายการการเงินหลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("finance")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือกรายการการเงินที่ต้องการลบ");
        return;
      }
      if (!confirm(`ยืนยันการลบรายการการเงิน ${rowIds.length} รายการ?`)) return;

      const idSet = new Set(rowIds);
      await this.repo.deleteRows("t23_tbl_income_expense", rowIds);
      this.clearChecked("finance");
      if (this.state.selected.finance && idSet.has(this.state.selected.finance)) {
        this.state.selected.finance = null;
      }
    });
  }

  async handleAddUnit() {
    await this.runProtected("เพิ่มหน่วยงาน", async () => {
      const rows = await this.repo.cloneTable("t26_unit");
      const form = await this.dialogs.openUnitDialog("add");
      if (!form) return;

      const duplicated = rows.some((row) => String(row["รหัสหน่วย"] || "") === form.unitCode);
      if (duplicated) throw new Error("รหัสหน่วยงานซ้ำในระบบ");

      const newRow = {
        __rowid: this.repo.createRowId("t26_unit"),
        ID: this.repo.getNextNumeric(rows, "ID"),
        "รหัสหน่วย": form.unitCode,
        "หน่วย": form.unitName,
        "เลขที่": form.addressNo,
        "หมู่": form.moo,
        "ถนน": form.road,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัส": form.postcode,
        "โทร": form.phone
      };

      rows.push(newRow);
      await this.repo.saveTable("t26_unit", rows);
      this.state.selected.units = newRow.__rowid;
    });
  }

  async handleEditUnit() {
    await this.runProtected("แก้ไขหน่วยงาน", async () => {
      const selected = await this.getSelectedRow("t26_unit", "units");
      if (!selected) {
        alert("กรุณาเลือกหน่วยงานก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t26_unit");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const oldCode = String(rows[index]["รหัสหน่วย"] || "");
      const form = await this.dialogs.openUnitDialog("edit", rows[index]);
      if (!form) return;

      const newCode = form.unitCode;
      const duplicated = rows.some((row, rowIndex) => rowIndex !== index && String(row["รหัสหน่วย"] || "") === newCode);
      if (duplicated) throw new Error("รหัสหน่วยงานซ้ำในระบบ");

      rows[index] = {
        ...rows[index],
        "รหัสหน่วย": newCode,
        "หน่วย": form.unitName,
        "เลขที่": form.addressNo,
        "หมู่": form.moo,
        "ถนน": form.road,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัส": form.postcode,
        "โทร": form.phone
      };

      await this.repo.saveTable("t26_unit", rows);

      if (oldCode !== newCode) {
        const [dependentRows, cmRows] = await Promise.all([
          this.repo.cloneTable("t04_dataj"),
          this.repo.cloneTable("t02_cm")
        ]);

        let dependentChanged = false;
        for (const row of dependentRows) {
          if (String(row["รหัสหน่วย"] || "") === oldCode) {
            row["รหัสหน่วย"] = newCode;
            dependentChanged = true;
          }
        }

        let cmChanged = false;
        for (const row of cmRows) {
          if (String(row["รหัสหน่วย"] || "") === oldCode) {
            row["รหัสหน่วย"] = newCode;
            cmChanged = true;
          }
        }

        if (dependentChanged) await this.repo.saveTable("t04_dataj", dependentRows);
        if (cmChanged) await this.repo.saveTable("t02_cm", cmRows);
      }
    });
  }

  async handleDeleteUnit() {
    await this.runProtected("ลบหน่วยงาน", async () => {
      const selected = await this.getSelectedRow("t26_unit", "units");
      if (!selected) {
        alert("กรุณาเลือกหน่วยงานก่อน");
        return;
      }

      const result = await this.deleteUnitsWithRelations({
        unitRowIds: [selected.__rowid],
        unitCodes: [String(selected["รหัสหน่วย"] || "")],
        confirmText: "ยืนยันการลบหน่วยงานที่เลือก?"
      });
      if (!result?.deleted) return;

      this.applyDeletionState(result);
    });
  }

  async handleDeleteUnitBatch() {
    await this.runProtected("ลบหน่วยงานหลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("units")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือกหน่วยงานที่ต้องการลบ");
        return;
      }

      const rows = await this.repo.cloneTable("t26_unit");
      const selectedUnits = rows.filter((row) => rowIds.includes(row.__rowid));
      if (!selectedUnits.length) return;

      const result = await this.deleteUnitsWithRelations({
        unitRowIds: rowIds,
        unitCodes: selectedUnits.map((row) => String(row["รหัสหน่วย"] || "")),
        confirmText: `ยืนยันการลบหน่วยงาน ${selectedUnits.length} รายการ?`
      });
      if (!result?.deleted) return;

      this.applyDeletionState(result);
    });
  }

  async collectLinkedRecordsForUnits(unitCodes) {
    const unitCodeSet = new Set((Array.isArray(unitCodes) ? unitCodes : []).map((item) => String(item || "").trim()).filter(Boolean));
    const [dependentRows, cmRows, cgRows] = await Promise.all([
      this.repo.getTable("t04_dataj"),
      this.repo.getTable("t02_cm"),
      this.repo.getTable("t01_cg")
    ]);

    const linkedCmRows = cmRows.filter((row) => unitCodeSet.has(String(row["รหัสหน่วย"] || "")));
    const cmCodeSet = new Set(linkedCmRows.map((row) => String(row["รหัสcm"] || "")).filter(Boolean));

    const linkedCgRows = cgRows.filter((row) => cmCodeSet.has(String(row["รหัสcm"] || "")));
    const cgCodeSet = new Set(linkedCgRows.map((row) => String(row["รหัสcg"] || "")).filter(Boolean));

    const linkedDependentRows = dependentRows.filter((row) => {
      const unitCode = String(row["รหัสหน่วย"] || "");
      const cmCode = String(row["รหัสcm"] || "");
      const cgCode = String(row["รหัสcg"] || "");
      return unitCodeSet.has(unitCode) || cmCodeSet.has(cmCode) || cgCodeSet.has(cgCode);
    });

    return {
      dependentRowIds: linkedDependentRows.map((row) => row.__rowid),
      cgRowIds: linkedCgRows.map((row) => row.__rowid),
      cmRowIds: linkedCmRows.map((row) => row.__rowid),
      linkedDependents: linkedDependentRows.length,
      linkedCgs: linkedCgRows.length,
      linkedCm: linkedCmRows.length
    };
  }

  async deleteUnitsWithRelations(config) {
    const unitRowIds = Array.isArray(config?.unitRowIds) ? config.unitRowIds.map((item) => String(item || "")).filter(Boolean) : [];
    const unitCodes = Array.isArray(config?.unitCodes) ? config.unitCodes : [];
    if (!unitRowIds.length) return { deleted: false };

    const links = await this.collectLinkedRecordsForUnits(unitCodes);
    const hasLinks = links.linkedDependents > 0 || links.linkedCgs > 0 || links.linkedCm > 0;

    if (!hasLinks) {
      if (!confirm(String(config?.confirmText || "ยืนยันการลบหน่วยงานที่เลือก?"))) return { deleted: false };
      await this.repo.deleteRows("t26_unit", unitRowIds);
      return {
        deleted: true,
        unitRowIds,
        dependentRowIds: [],
        cgRowIds: [],
        cmRowIds: []
      };
    }

    const cascadeConfirm = confirm(
      [
        "หน่วยงานที่เลือกมีข้อมูลเชื่อมอยู่",
        `- CM ${Format.number(links.linkedCm)} คน`,
        `- CG ${Format.number(links.linkedCgs)} คน`,
        `- LTC ${Format.number(links.linkedDependents)} ราย`,
        "",
        "ต้องการลบหน่วยงาน พร้อมข้อมูลเชื่อมทั้งหมดหรือไม่?",
        "ข้อมูลที่ลบสามารถกู้คืนจากถังขยะได้ภายใน 30 วัน"
      ].join("\n")
    );
    if (!cascadeConfirm) return { deleted: false };

    if (links.dependentRowIds.length) {
      await this.repo.deleteRows("t04_dataj", links.dependentRowIds);
    }
    if (links.cgRowIds.length) {
      await this.repo.deleteRows("t01_cg", links.cgRowIds);
    }
    if (links.cmRowIds.length) {
      await this.repo.deleteRows("t02_cm", links.cmRowIds);
    }
    await this.repo.deleteRows("t26_unit", unitRowIds);

    return {
      deleted: true,
      unitRowIds,
      dependentRowIds: links.dependentRowIds,
      cgRowIds: links.cgRowIds,
      cmRowIds: links.cmRowIds
    };
  }

  applyDeletionState(result) {
    const dependentIdSet = new Set(Array.isArray(result?.dependentRowIds) ? result.dependentRowIds : []);
    const cgIdSet = new Set(Array.isArray(result?.cgRowIds) ? result.cgRowIds : []);
    const cmIdSet = new Set(Array.isArray(result?.cmRowIds) ? result.cmRowIds : []);
    const unitIdSet = new Set(Array.isArray(result?.unitRowIds) ? result.unitRowIds : []);

    for (const rowId of dependentIdSet) this.getCheckedSet("dependents").delete(rowId);
    for (const rowId of cgIdSet) this.getCheckedSet("cg").delete(rowId);
    for (const rowId of cmIdSet) this.getCheckedSet("cm").delete(rowId);
    for (const rowId of unitIdSet) this.getCheckedSet("units").delete(rowId);

    if (this.state.selected.dependents && dependentIdSet.has(this.state.selected.dependents)) this.state.selected.dependents = null;
    if (this.state.selected.cg && cgIdSet.has(this.state.selected.cg)) this.state.selected.cg = null;
    if (this.state.selected.cm && cmIdSet.has(this.state.selected.cm)) this.state.selected.cm = null;
    if (this.state.selected.units && unitIdSet.has(this.state.selected.units)) this.state.selected.units = null;
  }

  async runProtected(actionLabel, handler) {
    const action = Format.cleanWhitespace(String(actionLabel || "").trim()) || "บันทึกข้อมูล";
    this.setStatus(`กำลัง${action}...`);
    try {
      await handler();
      await this.renderAll();
      await this.refreshStorageStatus();
    } catch (error) {
      this.setStatus(`${action}ไม่สำเร็จ`);
      throw error;
    }
  }

  async handleTrashRestored(aliases) {
    const uniqueAliases = Array.isArray(aliases) ? [...new Set(aliases.map((item) => String(item || "").trim()).filter(Boolean))] : [];
    if (!uniqueAliases.length) return;
    for (const alias of uniqueAliases) {
      this.repo.clearTableCache(alias);
    }
    await this.renderAll();
    await this.refreshStorageStatus();
  }

  async getSelectedRow(alias, stateKey) {
    const rowId = this.state.selected[stateKey];
    if (!rowId) return null;
    const rows = await this.repo.getTable(alias);
    return rows.find((row) => row.__rowid === rowId) || null;
  }

  async getSelectedProductRow() {
    const rowId = this.state.selected.supplies;
    if (!rowId) return null;
    const rows = await this.repo.getTable("t16_product");
    return rows.find((row) => row.__rowid === rowId) || null;
  }

  async getSelectedProductInventory() {
    const rowId = this.state.selected.supplies;
    if (!rowId) return null;
    const inventoryRows = await this.domain.computeInventoryRows();
    return inventoryRows.find((row) => row.rowId === rowId) || null;
  }

  generateCgCode(cmCode, rows) {
    const base = Format.toText(cmCode).replace(/cm\d+$/i, "") || "CG";
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}cg(\\d+)$`, "i");
    let max = 0;
    for (const row of rows) {
      const code = String(row["รหัสcg"] || "");
      const match = code.match(pattern);
      if (match) {
        const number = Number(match[1]);
        if (number > max) max = number;
      }
    }
    return `${base}cg${max + 1}`;
  }

  generateCmCode(unitCode, rows) {
    const base = Format.toText(unitCode) || "CM";
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}cm(\\d+)$`, "i");
    let max = 0;
    for (const row of rows) {
      const code = String(row["รหัสcm"] || "");
      const match = code.match(pattern);
      if (match) {
        const number = Number(match[1]);
        if (number > max) max = number;
      }
    }
    return `${base}cm${max + 1}`;
  }
}

const ltcAppActionMethods = Object.fromEntries(
  Object.getOwnPropertyNames(LtcAppActionMethodCarrier.prototype)
    .filter((name) => name !== "constructor")
    .map((name) => [name, LtcAppActionMethodCarrier.prototype[name]])
);

export { ltcAppActionMethods };
