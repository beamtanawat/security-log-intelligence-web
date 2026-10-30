# คำสั่งเริ่มงานสำหรับสอง AI

นำโฟลเดอร์ docs/superpowers จากชุดแผนนี้ไปไว้ใน repo security-log-intelligence ให้ทั้งสอง AI อ่านไฟล์เดียวกันก่อนเริ่ม ใช้ branch/worktree คนละชุด ห้ามแก้ทับกัน อย่าเริ่มทำ UI กับ API คนละสัญญา

## Codex — backend, contract และ integration

คัดลอกข้อความนี้ไปใช้ได้:

> ทำเว็บ MVP จาก repo security-log-intelligence ตาม docs/superpowers/specs/2026-10-30-security-log-web-design.md และ docs/superpowers/plans/2026-10-30-security-log-web.md อ่าน AGENTS.md และตรวจ HEAD/working tree ก่อน เริ่ม Task 1: ตรวจ Python/dependency และ baseline แล้วสร้าง docs/web/api-contract.md พร้อม JSON examples ให้ Claude ใช้ หลังจากนั้นทำ Tasks 2–3 และเป็นผู้รวม Task 5 คุณเป็นเจ้าของ src/web_api/, tests/test_web_*.py, sample generator, contract และ deployment config Claude เป็นเจ้าของ web/ จึงต้องประสานก่อนแก้ไฟล์ของเขา เพิ่ม API เว็บแยกจาก read-only API เดิม ใช้กฎเดิมกับหลักฐานจริง ไม่เรียก frozen research pipeline ตรง ๆ และไม่ retrain/รัน benchmark TEST ไม่อ้างว่าทดสอบผ่านหากยังไม่ได้รัน ไม่ commit/push โดยอัตโนมัติ รายงาน API contract เมื่อพร้อมให้เริ่มงาน frontend

โมเดลแนะนำ: GPT-6.1 reasoning High สำหรับ contract/backend/integration; Medium สำหรับงานแก้ไขตรงไปตรงมา ใช้รุ่นที่บัญชีมีจริง

## Claude Code — frontend

คัดลอกข้อความนี้เมื่อ Codex ส่ง API contract แล้ว:

> ทำ frontend ใน web/ สำหรับ Security Log Intelligence ตาม docs/superpowers/specs/2026-10-30-security-log-web-design.md และ Task 4 ใน docs/superpowers/plans/2026-10-30-security-log-web.md อ่าน AGENTS.md และ docs/web/api-contract.md พร้อม examples ก่อน ใช้ React + TypeScript + Vite + Tailwind + Recharts สร้างหน้า Upload และ Dashboard โทน dark navy/cyan โดยอิงภาพที่ผู้ใช้ให้ ไม่ต้องเหมือนทุกพิกเซล มีกราฟ ตัวกรอง ตาราง evidence drawer สรุปที่ระบุว่า rules-based และ export/print สำหรับ PDF รองรับมือถือ/keyboard/loading/empty/error/expired อย่าแสดง attack probability, accuracy หรือข้อมูลประเทศที่ไม่มีหลักฐาน ข้อมูลตัวอย่างต้องระบุว่า demo ห้าม fallback เป็นข้อมูลปลอมเมื่อ API จริงเสีย คุณแก้เฉพาะ web/ ไม่แก้ backend, requirements, API contract หรือ lockfiles นอก web/ ใช้ relative /api และ polling ที่หยุดเมื่อจบงาน ทดสอบ interaction สำคัญ รัน typecheck/tests/build แล้วส่งรายการไฟล์ ผลตรวจ และสิ่งที่ยังติดให้ Codex ไม่ commit/push โดยอัตโนมัติ

โมเดลแนะนำ: Sonnet รุ่นล่าสุดที่มีในบัญชี ใช้ Opus ที่มีเฉพาะเมื่อเจอปัญหาออกแบบ/บั๊กยาก ไม่จำเป็นต้องเปิดรุ่นแพงที่สุดทุกงาน

## จุดส่งงาน

1. Codex ส่ง contract + example responses → Claude เริ่มพัฒนา UI ได้
2. Codex ส่ง API ที่รันได้ + คำสั่งเริ่ม server → Claude ต่อข้อมูลจริง
3. Claude ส่ง build ที่ผ่าน + รายการข้อจำกัด → Codex รวมและทดสอบครบ flow
4. ตรวจ Live URL กับ sample/ไฟล์ผิด/ไฟล์ถูก/export ก่อนถือว่าพร้อมสัมภาษณ์

ไม่จำเป็นต้องให้ทั้งสอง AI สร้าง backend หรือ frontend ซ้ำกัน ถ้าสัญญา API ต้องเปลี่ยน ให้ Codex อัปเดตเอกสารและแจ้ง Claude ก่อน

## โมเดลในเว็บ

เปิดตัวด้วยกฎเดิมและ deterministic summary ที่ระบุวิธีสร้างอย่างชัดเจน Isolation Forest และ LLM เป็นงาน optional หลัง flow หลักผ่านแล้ว เลือก LLM จาก API ที่ผู้ใช้เข้าถึงได้จริง ไม่สมมติว่ามี API key จากการสมัคร Claude Code/Codex และไม่ใส่ API key ใน frontend
