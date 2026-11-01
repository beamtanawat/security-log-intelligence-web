# เตรียม deploy ด้วย private container image

สถานะ: build และทดสอบ image กับโมเดลทั้งสองภายใน workspace แล้ว ยังไม่ได้ push image ไป registry หรือ deploy บน Render.

- Image มีไฟล์โมเดลและ feature metadata อยู่ภายใน ต้องใช้ private registry และห้ามเผยแพร่ image แบบ public. ไฟล์โมเดลยังอยู่ใน data/ ที่ gitignore และไม่อยู่ใน Git.
- สร้างโฟลเดอร์ `data/local-models/unsw-s2/` และ `data/local-models/fortigate/` แล้วคัดลอกไฟล์ 4 ไฟล์ของแต่ละโมเดลตาม `docs/web/api-contract.md`; ห้ามใส่ log หรือ secrets ใน build context. `.dockerignore` อนุญาตเฉพาะไฟล์ที่จำเป็น.
- ติดตั้ง Docker Desktop และ build บนเครื่องที่มี artifacts: `docker buildx build --platform linux/amd64 -f Dockerfile.deploy -t IMAGE_NAME --load .` โดยแทน `IMAGE_NAME` ด้วยชื่อ image สำหรับทดสอบ.
- ตรวจจริงโดยรัน container ที่สร้างและทดสอบทั้ง FortiGate และ UNSW ผ่านหน้าเว็บก่อนส่ง image ไปที่ private registry. การทดสอบ HTTP ในเครื่องตั้ง `SLI_SECURE_COOKIES=false` เพราะ cookie ที่ตั้ง secure ต้องใช้ HTTPS; production ต้องเป็น true.
- เปิด private registry ให้ Render เข้าถึงด้วย credential แบบอ่านอย่างเดียว แล้วสร้าง Render Web Service จาก image นั้น. ห้ามใส่ credential ลง Git หรือแชท. Render ต้องใช้ image แบบ linux/amd64.
- หลัง deploy ทดสอบ Live URL ด้วยไฟล์สังเคราะห์สองแหล่งใน session เดียว; ตรวจผล AI ทั้งสองโมเดลและ dashboard. ไม่ถือว่าสำเร็จจาก health check เพียงอย่างเดียว.

Render Free ไม่รองรับ persistent disk หรือ shell; ไม่พึ่งการคัดลอกไฟล์ไปที่ filesystem หลัง deploy. บริการอาจหยุดเมื่อไม่มีการใช้งาน และงาน/เซสชันจะหายเมื่อ process เริ่มใหม่. โปรดตรวจข้อจำกัดและราคา Render ก่อนเลือกแผน.

## Staging: ตัวเลือก build สำหรับหน้าเข้าสู่ระบบ

Frontend staging ใช้ค่า **public** สองตัวที่ต้องระบุขณะ build image ไม่ใช่ตั้งเพิ่มตอน container เริ่มทำงาน:

```sh
docker buildx build --platform linux/amd64 -f Dockerfile.deploy \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
  -t IMAGE_NAME --load .
```

กำหนดตัวแปรใน environment ของผู้ build เอง: URL โปรเจกต์ staging และ **publishable key** เท่านั้น ค่าทั้งสองถูกฝังใน JavaScript ที่ผู้ใช้เว็บอ่านได้ และอาจปรากฏใน metadata หรือ build logs **ห้าม** ใช้ service-role/secret key, รหัสฐานข้อมูล, connection string หรือ access token เป็น build argument หากเว้นว่างทั้งสองค่า image จะยังใช้ anonymous demo โดยไม่เปิดส่วนเข้าสู่ระบบ เมื่อเปลี่ยน URL หรือ publishable key ต้อง build image ใหม่

Backend ต้องได้รับ `SLI_SUPABASE_URL`, `SLI_SUPABASE_PUBLISHABLE_KEY` และ `SLI_WORKSPACE_DATABASE_URL` ตอน container ทำงานผ่าน secret configuration ของ staging service; database URL เป็น secret ฝั่ง server เท่านั้นและต้องใช้ TLS `sslmode=verify-full` พร้อม CA ที่เชื่อถือได้ ห้ามบันทึกค่าใน Git หรือ image. การ build สำเร็จยังไม่ยืนยันการล็อกอินหรือ RLS จริง ต้องทดสอบ staging ด้วยผู้ใช้สองบัญชีก่อนพิจารณา deploy เว็บหลัก
