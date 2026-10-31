# เตรียม deploy ด้วย private container image

สถานะ: build และทดสอบ image กับโมเดลทั้งสองภายใน workspace แล้ว ยังไม่ได้ push image ไป registry หรือ deploy บน Render.

- Image มีไฟล์โมเดลและ feature metadata อยู่ภายใน ต้องใช้ private registry และห้ามเผยแพร่ image แบบ public. ไฟล์โมเดลยังอยู่ใน data/ ที่ gitignore และไม่อยู่ใน Git.
- สร้างโฟลเดอร์ `data/local-models/unsw-s2/` และ `data/local-models/fortigate/` แล้วคัดลอกไฟล์ 4 ไฟล์ของแต่ละโมเดลตาม `docs/web/api-contract.md`; ห้ามใส่ log หรือ secrets ใน build context. `.dockerignore` อนุญาตเฉพาะไฟล์ที่จำเป็น.
- ติดตั้ง Docker Desktop และ build บนเครื่องที่มี artifacts: `docker buildx build --platform linux/amd64 -f Dockerfile.deploy -t IMAGE_NAME --load .` โดยแทน `IMAGE_NAME` ด้วยชื่อ image สำหรับทดสอบ.
- ตรวจจริงโดยรัน container ที่สร้างและทดสอบทั้ง FortiGate และ UNSW ผ่านหน้าเว็บก่อนส่ง image ไปที่ private registry. การทดสอบ HTTP ในเครื่องตั้ง `SLI_SECURE_COOKIES=false` เพราะ cookie ที่ตั้ง secure ต้องใช้ HTTPS; production ต้องเป็น true.
- เปิด private registry ให้ Render เข้าถึงด้วย credential แบบอ่านอย่างเดียว แล้วสร้าง Render Web Service จาก image นั้น. ห้ามใส่ credential ลง Git หรือแชท. Render ต้องใช้ image แบบ linux/amd64.
- หลัง deploy ทดสอบ Live URL ด้วยไฟล์สังเคราะห์สองแหล่งใน session เดียว; ตรวจผล AI ทั้งสองโมเดลและ dashboard. ไม่ถือว่าสำเร็จจาก health check เพียงอย่างเดียว.

Render Free ไม่รองรับ persistent disk หรือ shell; ไม่พึ่งการคัดลอกไฟล์ไปที่ filesystem หลัง deploy. บริการอาจหยุดเมื่อไม่มีการใช้งาน และงาน/เซสชันจะหายเมื่อ process เริ่มใหม่. โปรดตรวจข้อจำกัดและราคา Render ก่อนเลือกแผน.
