# Prompt สำหรับ Claude Code — frontend owner

เปิด Claude Code ที่ root ของ repo ใหม่ beamtanawat/security-log-intelligence-web ไฟล์ backend, แผน และ API contract อยู่ใน repo นี้แล้ว ให้ git fetch/clone repo นี้ก่อน ไม่ต้องหาไฟล์ใน /workspace หรือดาวน์โหลด ZIP หากกำลังเปิด repo เก่า security-log-intelligence ให้เปลี่ยนมา repo ใหม่นี้ก่อนโดยไม่แก้ทับงานเก่า อ่าน docs/provenance.md เพื่อเข้าใจว่าส่วนใดต่อยอดจากงานเดิม

---

คุณรับผิดชอบ frontend ของโปรเจกต์ Security Log Intelligence ส่วน Codex อีกแชตรับผิดชอบ backend, API contract และ integration ผู้ใช้อนุมัติแนวทาง React + FastAPI แล้ว ให้ลงมือทำ Task 4 ตามแผนโดยไม่ย้อนเริ่มออกแบบใหม่

ก่อนเขียนโค้ด ให้อ่านไฟล์ตามลำดับนี้จาก root โปรเจกต์:
1. AGENTS.md และ AGENTS.md ย่อยถ้ามี
2. README.md
3. docs/superpowers/specs/2026-10-30-security-log-web-design.md
4. docs/superpowers/plans/2026-10-30-security-log-web.md โดยอ่าน Global Constraints, API interfaces, Task 4 และส่วนเชื่อม Task 5
5. docs/superpowers/plans/2026-10-30-agent-handoff-th.md
6. docs/web/api-contract.md — เป็นสัญญาที่ frontend ต้องยึด
7. docs/web/examples/*.json ถ้ามี เป็น response ตัวอย่างจาก synthetic data
8. docs/web/backend-runbook.md และ docs/web/progress.md ถ้ามี เพื่อดูคำสั่งรันจริงและสถานะล่าสุด

ตรวจ git status/branch ก่อน ห้าม checkout ทับงานของผู้ใช้ ใช้ branch หรือ worktree สำหรับ frontend แยกจาก backend ถ้าอยู่ใน worktree คนละชุดให้แน่ใจว่าไฟล์ contract ล่าสุดถูกคัดลอกมาถึงแล้ว ถ้าไฟล์บังคับข้อ 1–6 หาย ให้บอกตำแหน่งที่ขาดแทนการเดา API

ขอบเขตที่แก้ได้: web/ เท่านั้น รวม package.json, lockfile, TypeScript/Vite/Tailwind config, src/, tests และคู่มือ frontend ภายใน web/ ห้ามแก้ src/web_api/, API contract, requirements*, historical ML pipeline, ไฟล์ทดสอบ backend หรือ deployment config ถ้าต้องเปลี่ยน API ให้เขียนคำขอเปลี่ยน interface ในรายงานส่ง Codex ไม่แก้เอง

สร้าง React + TypeScript + Vite + Tailwind CSS + Recharts โดยเลือก package versions ที่มีจริงและเก็บ lockfile ถ้ามี web/ อยู่แล้วให้อ่านและต่อยอดก่อน ไม่ scaffold ทับไฟล์

หน้าตา: SOC dashboard โทน dark navy/cyan มีความโปร่ง อ่านง่าย สถานะ/ตัวเลขชัดเจน อิงภาพตัวอย่างแต่ไม่ต้องเหมือนทุกจุด ใช้ชื่อ Security Log Intelligence ของโปรเจกต์ ไม่คัดลอกชื่อ SATI โดยอัตโนมัติ ไม่ทำ 3D globe ใน MVP

หน้าแรก:
- อธิบายว่าเป็นการวิเคราะห์ FortiGate CSV ตาม schema ที่รองรับ
- file picker ที่ใช้ keyboard ได้ พร้อม drag/drop และการตรวจขนาด/นามสกุลเบื้องต้น
- อ่านข้อกำหนดจาก GET /api/schema พร้อมลิงก์ดาวน์โหลด GET /api/sample
- ปุ่มลองข้อมูลสังเคราะห์เรียก POST /api/demo
- แจ้งว่าข้อมูลชั่วคราวอายุไม่เกิน 60 นาทีและอาจหายเมื่อ server restart
- upload เรียก POST /api/uploads ด้วย FormData field ชื่อ file ห้ามกำหนด Content-Type เอง
- แสดงสถานะผ่าน status_url ที่ API ส่งกลับ ทุกประมาณ 1 วินาที ไม่มี progress percentage ที่แต่งขึ้น หยุด polling เมื่อจบ/ล้มเหลว/หมดอายุ/ออกจากหน้า

Dashboard:
- filename, ช่วงเวลาจากข้อมูล, เวลาเริ่มวิเคราะห์, engine=rules และ demo badge เมื่อ is_demo=true
- cards แยกจำนวน records, denied events, findings, normalization issues และ invalid records ไม่ตีความ issue ทุกชนิดเป็นข้อมูลเสีย
- timeline ตาม response จริง พร้อมข้อความว่าเวลาเป็นการอนุมาน Unix epoch seconds ที่ยังไม่ยืนยัน semantics ของต้นทาง
- rule distribution, top source identifiers, destination ports และ applications
- ตาราง findings ที่ filter severity/rule ได้ มี pagination ใช้ total จาก API และ reset offset เมื่อเปลี่ยน filter
- detail drawer แสดง reason, source record number, evidence, uncertainties, normalization issues และ false-positive note
- ปุ่ม export JSON/CSV ส่ง filters เดียวกับตาราง และ print stylesheet สำหรับ browser Save as PDF
- summary panel แสดง mode=deterministic และอ้าง finding IDs ที่กดดูได้ ระบุว่าเป็นสรุปจากกฎ ไม่เปิด input แชตที่ทำงานไม่ได้ เพราะ chat_available=false

ความถูกต้อง:
- ทั้งสอง active rules ตอนนี้เป็น INFORMATIONAL; ห้ามสร้าง High risk หรือ attack taxonomy เพิ่มเอง
- anomaly / rule match / deny ไม่ได้ยืนยันการโจมตี
- ไม่มี Accuracy/F1/attack probability สำหรับ uploaded file
- sanitized source/destination เป็น identifiers ไม่ใช่ IP ที่นำไปเดาประเทศได้
- render log text เป็น text/JSON ห้าม dangerouslySetInnerHTML
- ใช้ข้อมูล API จริง ไม่มี silent fallback เป็น fake dashboard เมื่อ backend error
- development fixtures ใช้ได้เฉพาะโหมดที่ระบุชัดและห้ามหลุดไปเป็น production fallback

การเชื่อม API:
- relative /api URLs, credentials same-origin; browser session cookie จัดการโดย server
- Vite dev proxy /api และ /healthz ไป http://127.0.0.1:8000 โดย changeOrigin:false; รัน Vite host 127.0.0.1 เพื่อให้ Host ผ่าน allowed hosts ของ backend
- จัดการ 408 อัปโหลดหมดเวลา, 409 ยังไม่พร้อม, 410 หมดอายุ, 413 เกินขนาด, 422 validation, 429 busy, network errors โดยแสดงคำอธิบายและทางกลับ upload
- ห้าม retry POST upload/demo อัตโนมัติจนสร้างงานซ้ำ
- frontend production build อยู่ web/dist/

คุณภาพและการส่งงาน:
- รองรับหน้าจอ desktop และ 390px; table เลื่อนแนวนอนได้โดย layout ไม่พัง
- มี loading/empty/error/expired states, accessible labels, keyboard focus และปิด drawer ด้วย Escape
- เขียน interaction tests ที่จับพฤติกรรมสำคัญ: upload fail แล้วแก้ไขได้, polling ไป completed แล้วหยุด, expired กลับไป upload ได้, null time ไม่สร้างวันที่ปลอม, เปลี่ยน filter แล้ว reset page
- รัน typecheck, tests และ production build ด้วยคำสั่งจริง เก็บ log ผลผ่าน/ไม่ผ่านอย่างตรงไปตรงมา
- เมื่อ API backend พร้อมให้ลอง sample flow จริง ไม่อ้างว่า end-to-end ผ่านจาก mock อย่างเดียว
- ส่งรายการไฟล์ที่เปลี่ยน คำสั่งรัน ผลตรวจ ข้อจำกัด และ interface ที่อยากเปลี่ยนให้ผู้ใช้ส่งกลับ Codex
- ไม่ commit, push, merge หรือ publish โดยอัตโนมัติ

เริ่มอ่านไฟล์ทั้งหมดและลงมือทำ frontend ตามนี้ได้เลย
