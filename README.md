# LTC Chamrak Web App

ระบบ LTC สำหรับเทศบาลชำราก (Frontend + Backend) โดยใช้ข้อมูล JSON จาก `chamrak_export`

## Features

- Dashboard + CRUD ครบทุกโมดูลหลัก
- ลบหลายรายการด้วย checkbox (batch delete)
- AI Assistant ในระบบ (หน้า `AI Assistant`) สำหรับสรุปข้อมูลจากฐานข้อมูลจริง
- หน้า `บันทึกกิจกรรม/กู้คืน` สำหรับดู Audit Log, Export CSV, กู้คืนข้อมูลที่ลบ
- Security 2 ชั้น
  - Login session (cookie-based auth)
  - PIN lock สำหรับการแก้ไขข้อมูลในหน้าแอป
  - Login rate limit ป้องกัน brute-force
- Soft-delete + Restore
  - การลบข้อมูลผ่านหน้าแอปจะถูกย้ายไปถังขยะ (Trash)
  - กู้คืนได้ภายใน 30 วัน จากหน้า Logs/Restore
- ระบบเก็บข้อมูลแบบไม่ทับต้นฉบับ
  - อ่านข้อมูลต้นทางจาก `chamrak_export/data/*.json`
  - เขียนข้อมูลแก้ไขไปที่ `runtime_data/overrides/*.json`

## Project Structure

- `index.html` หน้าแอปหลัก (ต้อง login ก่อน)
- `login.html` หน้าเข้าสู่ระบบ
- `server/index.js` backend entrypoint (bootstrap)
- `server/app.js` backend API + auth + static protection
- `web/app.js` bootstrap frontend
- `web/js/config.js` constants
- `web/js/utils.js` utility classes (`Format`, `Validate`, `NameUtils`)
- `web/js/data-repository.js` data access layer
- `web/js/security-manager.js` PIN manager
- `web/js/domain-service.js` domain logic
- `web/js/ltc-app.js` app controller
- `web/js/app-helpers.js` helper class สำหรับ app
- `web/js/entity-dialog-service.js` dialog/form service
- `web/js/ai-assistant-page.js` controller หน้า AI
- `web/js/activity-log-page.js` controller หน้า logs + restore
- `web/js/security.js` security toolkit + local scan tests
- `web/js/session.js` session guard
- `web/styles.css` CSS entrypoint
- `web/styles/*.css` CSS modules (`base`, `layout`, `components`, `dialog`, `responsive`)
- `web/public/login.css` style หน้า login
- `web/public/login.js` script หน้า login + remember login preference

## Run

1. ติดตั้ง dependency

```bash
npm install
```

2. รันโหมดพัฒนา

```bash
npm run dev
```

คำสั่งนี้รัน backend (`server/index.js`) และเสิร์ฟ frontend ทั้งหมดจากพอร์ตเดียวกัน (`3000`)

3. เปิดใช้งาน

- App: `http://localhost:3000/`
- Login: `http://localhost:3000/login.html`

## Default Credentials

- Username: `admin`
- Password: `admin123456`

ควรเปลี่ยนผ่าน Environment Variables:

```bash
LTC_ADMIN_USER=your_user
LTC_ADMIN_PASSWORD=your_password
LTC_TOKEN_SECRET=long-random-secret
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash
GEMINI_TIMEOUT_MS=12000
AI_CONTEXT_CACHE_MS=2000
AI_MAX_CONCURRENT=8
AI_MAX_CONCURRENT_PER_CLIENT=2
AI_MAX_QUEUE=100
AI_QUEUE_TIMEOUT_MS=15000
```

ตัวอย่าง (Linux/macOS):

```bash
LTC_ADMIN_USER=admin LTC_ADMIN_PASSWORD=strong-pass LTC_TOKEN_SECRET='super-secret' GEMINI_API_KEY='your-key' AI_MAX_CONCURRENT=8 AI_MAX_QUEUE=100 npm run dev
```

ตัวอย่าง (PowerShell):

```powershell
$env:LTC_ADMIN_USER = "admin"
$env:LTC_ADMIN_PASSWORD = "strong-pass"
$env:LTC_TOKEN_SECRET = "super-secret"
$env:GEMINI_API_KEY = "your-key"
npm run dev
```

หมายเหตุ:
- อย่า hardcode API key ลงไฟล์โค้ด
- ใช้ `.env` (ไฟล์นี้ถูก ignore แล้ว) หรือ environment variable ของระบบแทน

## Security Notes

- Backend ป้องกันเส้นทางสำคัญทั้งหมด (`/`, `/index.html`, `/web/*`, `/api/*`, `/chamrak_export/*`)
- Session ใช้ HttpOnly cookie (SameSite=Lax)
- ตัวเลือก "จดจำการเข้าสู่ระบบ" จะเก็บเฉพาะสถานะ remember + username (ไม่เก็บรหัสผ่านดิบ)
- ถ้าต้องการจำรหัสผ่านจริง ให้ใช้ Password Manager ของเบราว์เซอร์
- session cookie ใช้ HttpOnly + SameSite=Lax และเปิด `Secure` อัตโนมัติเมื่อ `NODE_ENV=production`
- มี rate limit ที่ `/auth/login` (ตอบกลับ `429` เมื่อพยายามผิดถี่เกินกำหนด)
- มี AI concurrency guard ที่ `/api/ai/chat` (จำกัดงานพร้อมกัน + คิวรอ + timeout เมื่อระบบหนาแน่น)
- มี Security Scan endpoint (`POST /api/security/scan`) และ local security self-test ฝั่ง frontend
- มี Audit logs (`/api/logs`) และ export CSV (`/api/logs/export`)
- มี Trash restore (`/api/trash`, `/api/trash/restore`) และ purge ข้อมูลหมดอายุอัตโนมัติ

## Data Flow

1. ผู้ใช้ login สำเร็จ => ได้ session cookie
2. Frontend เรียก `/api/tables/:alias` เพื่ออ่านข้อมูล
3. แก้ไขข้อมูลแล้วส่ง `PUT /api/tables/:alias`
4. Backend บันทึกไปที่ `runtime_data/overrides/:alias.json`
5. เมื่ออ่านรอบถัดไป backend จะใช้ override ก่อน source

## Optimization/Refactor ที่ทำแล้ว

- แยกโค้ด JS ออกเป็นโมดูล class-based ชัดเจน
- แยก CSS เป็นหลายไฟล์ตามหน้าที่
- เพิ่ม session guard ก่อนเริ่ม app
- ลด coupling ระหว่าง UI และ data access
- เพิ่ม handling สำหรับ auth-expired redirect
