# LTC Chamrak Update Workflow

ระบบอัปเดตนี้อัปเดตเฉพาะตัวโปรแกรม ไม่ sync ข้อมูลผู้ใช้ และไม่ใช้ database กลาง ข้อมูล runtime ของแต่ละเครื่องยังอยู่ในพื้นที่ `userData` ของเครื่องนั้นเหมือนเดิม

## ตั้งค่าแหล่งอัปเดต

ก่อน build โปรแกรมจริง ให้แก้ไฟล์:

```json
{
  "url": "https://your-update-host.example/ltc-chamrak"
}
```

ที่ `desktop/update-config.json`

ค่า `url` ต้องเป็นโฟลเดอร์/ที่อยู่ที่โปรแกรมโหลดไฟล์อัปเดตได้โดยตรง เช่น static hosting หรือ direct-download endpoint ที่เสถียร ถ้าใช้ Google Drive ต้องเป็นลิงก์แบบดาวน์โหลดไฟล์ได้โดยตรง ไม่ใช่หน้า preview/share ปกติ

## ปล่อยเวอร์ชันใหม่

1. เพิ่ม version ใน `package.json`
2. build ด้วย `npm run electron:build`
3. upload ไฟล์จาก `dist/` ไปที่ update URL เดียวกัน
   - installer หรือ portable `.exe`
   - `latest.yml`
   - ไฟล์ `.blockmap` ถ้ามี
4. ถ้าต้องการให้กล่องอัปเดตโชว์รายละเอียด ให้เพิ่ม `releaseNotes` ใน `latest.yml`

ตัวอย่าง:

```yaml
version: 1.0.1
files:
  - url: LTC Chamrak Setup 1.0.1.exe
    sha512: ...
    size: ...
path: LTC Chamrak Setup 1.0.1.exe
sha512: ...
releaseDate: "2026-06-25T00:00:00.000Z"
releaseNotes:
  - เพิ่มปุ่มอัปเดตโปรแกรม
  - ปรับหน้าจอให้เข้าใจง่ายขึ้น
```

## การใช้งานในโปรแกรม

เมื่อผู้ใช้กดปุ่ม download บนหัวโปรแกรม โปรแกรมจะตรวจเวอร์ชันจาก update URL ถ้ามีเวอร์ชันใหม่จะดาวน์โหลด แล้วเปิดกล่องรายละเอียดว่ามีอะไรเปลี่ยนบ้าง เมื่อติดตั้ง ผู้ใช้จะกด `ติดตั้งตอนนี้` เพื่อ restart และใช้เวอร์ชันใหม่
