# runtime_data

โฟลเดอร์นี้ใช้เก็บไฟล์แก้ไขจริงจาก backend

- `overrides/<table_alias>.json`
- ตัวอย่าง `overrides/t04_dataj.json`

หมายเหตุ: backend จะอ่านข้อมูลจาก `chamrak_export/data/*.json` ก่อนเสมอ
และถ้ามีไฟล์ override จะใช้ override แทนโดยไม่แก้ไฟล์ต้นฉบับ
