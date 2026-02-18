# chamrak_export

This folder contains full export data from:
- source: C:\Users\User\Downloads\dataLTC.accdb
- generated_at_utc: 2026-02-18T06:01:48Z

## What is included
- Full table export (26 tables) in data/*.json
- Metadata for table/column aliases and constraints in metadata/
- Municipality image asset extraction in ssets/t25_municipality/

## Transform rules applied
- Non-geo tables were normalized to:
  - tambon: ชำราก
  - amphur: เมืองตราด
  - province: ตราด
- Municipality code fields were overridden:
  - ตำบล = 230113
  - อำเภอ = 160
  - จังหวัด = 14
  - รหัส = 23000
- Municipality office naming:
  - สนง = เทศบาลตำบลชำราก
  - ชื่อสำนักงาน = ศูนย์พัฒนาคุณภาพชีวิตผู้สูงอายุ ผู้พิการ และผู้ที่มีภาวะพึ่งพิง ทต.ชำราก
- Geo lookup tables kept unchanged:
  - tb_province, tb_amphur, tb_district

## Key files
- manifest.json
- metadata/table_alias_map.json
- metadata/column_aliases/*.json
- metadata/primary_keys.json
- metadata/foreign_keys.json
- metadata/validation_report.json

## Data format
- Date/DateTime fields are ISO 8601 (yyyy-MM-ddTHH:mm:ss)
- Null values are 
ull
- Text is UTF-8 JSON
- Binary pic field is extracted as files with _pic_asset metadata

## Validation
See metadata/validation_report.json.