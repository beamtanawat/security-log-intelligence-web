# Prompt ต่อเนื่องสำหรับ Claude — FortiGate + UNSW-NB15

ใช้กับ repo beamtanawat/security-log-intelligence-web เท่านั้น เป็นการต่อจาก Task 4 ที่ทำแล้ว ไม่ใช่เริ่มสร้างเว็บใหม่

## รับ backend/contract ใหม่โดยรักษา frontend เดิม

1. ตรวจ git status, branch และ remote ห้าม reset, clean หรือ scaffold ทับ web/ ที่ยังไม่ commit
2. Backend ใหม่อยู่ branch origin/codex/multi-source-backend ให้ git fetch origin ก่อน
3. ถ้า claude/web-frontend ยังไม่มี commit เพิ่มจาก main และแก้เฉพาะ web/ ตามรายงาน ให้ตรวจว่า backend branch ไม่แก้ web/ แล้วใช้ git merge --ff-only origin/codex/multi-source-backend ขณะอยู่บน claude/web-frontend เพื่อรับ backend โดยรักษาไฟล์ web/ เดิม ห้ามเปลี่ยนไปแก้ main
4. ถ้า fast-forward ไม่ได้ หรือมีไฟล์นอก web/ ชนกัน ให้รายงานความขัดแย้ง ห้าม force/reset/เขียนทับ ระหว่างนั้นอ่าน contract ล่าสุดผ่าน git show origin/codex/multi-source-backend:docs/web/api-contract.md ได้
5. อ่าน AGENTS.md, README.md, docs/provenance.md, docs/web/multi-source-design.md, docs/web/api-contract.md v1.1, docs/web/examples/schema.json, docs/web/examples/unsw-summary.json, docs/web/examples/unsw-records.json, docs/web/progress.md และแผนเดิม Task 4/5 ให้ครบก่อนแก้ UI

## เป้าหมาย

ต่อยอดหน้า Upload/Dashboard ที่มีอยู่ให้รองรับ 2 sources:
- fortigate: กฎและ findings เดิม
- unsw_nb15: สถิติ network flows + label ที่มากับไฟล์ เป็น descriptive profiling เท่านั้น ยังไม่มีโมเดล inference

แก้เฉพาะ web/ รวม types/client/components/tests/config/lockfile ภายใน web/ ห้ามแก้ src/, requirements, API contract หรือ deployment config ถ้าจำเป็นให้ส่งข้อเสนอมา Codex

## หน้า Upload

- โหลด schema.sources แล้วมี selector ให้เลือก source โดยใช้ name จาก API
- แสดง required_columns/optional_columns ของ source ที่เลือก ตลอดจนข้อจำกัดขนาดและจำนวนแถว
- ส่ง FormData: file และ source_type (เลือก fortigate หรือ unsw_nb15) ห้ามกำหนด Content-Type เอง
- demo ใช้ POST /api/demo?source_type=<selected> และ sample ใช้ GET /api/sample?source_type=<selected>
- ไม่ auto-detect ว่ามี label แล้วต้องเป็น UNSW และไม่ fallback ไป parser อื่นเมื่อไฟล์ผิด
- แจ้งว่าไฟล์ UNSW ชุดเต็มอาจเกิน 10 MiB / 50,000 แถว ต้องใช้ subset ที่ผู้ใช้เลือกเอง ไม่ตัดแถวเงียบ ๆ
- เมื่อเปลี่ยน source หรือเริ่ม job ใหม่ ให้ล้าง state/filter/pagination ของ analysis เดิม ป้องกันผลเก่าปนกัน

## Dashboard ตาม summary.source_type / capabilities

FortiGate:
- รักษาเส้นทางเดิม cards/timeline/network/ports/findings/evidence/exports
- severity และ category เป็นคนละอย่าง: กฎเดิมสองกฎ INFORMATIONAL และ metadata category=SOURCE_PRODUCT_OBSERVATION ไม่มี attack classification

UNSW:
- engine=profile แสดงคำอธิบายชัดเจนว่าเป็นสถิติจากข้อมูล ไม่มีผลทำนาย AI
- แสดง input/analyzed records, quality issues, invalid records, protocol_counts, top_applications (service), state_counts และ numeric_stats
- ตัวเลข min/max/mean ที่เป็น null ให้แสดงว่าไม่มีข้อมูล ห้ามแทนด้วยศูนย์
- labels.available=true จึงแสดง binary_counts และ attack_category_counts พร้อมข้อความ “Label/หมวดหมู่ที่ระบุในไฟล์ ไม่ใช่ผลทำนายของระบบ” แสดง labeled_records/unlabeled_records/invalid_label_records
- labels.available=false ให้ซ่อน label charts หรือแสดงว่าไฟล์ไม่มี label ที่ใช้ได้ ห้ามแต่ง distribution
- labels เป็นข้อมูลที่ผู้ใช้อัปโหลด ไม่ใช่ ground truth ที่ระบบตรวจยืนยันโดยอิสระ ความขัดแย้งระหว่าง label/category ให้แสดง quality issue
- summary.inference.available=false จึงไม่มี prediction, accuracy, precision, recall, F1, risk score หรือ attack probability
- ใช้ GET /api/analyses/{id}/records?offset=0&limit=50 สำหรับตาราง flows แยกจาก findings
- FlowRecord มี source_record_number, source_id, feature_values, ground_truth และ normalization_issues; แสดง label/category แยกคอลัมน์จาก features
- source_id เป็น row identifier ไม่ใช่ IP หรือเวลา ห้ามใช้สร้างประเทศ/แผนที่/timeline
- capabilities.findings=false จึงซ่อน findings/filter severity/rule และ finding export ไม่มี detector findings สำหรับ UNSW ใน release นี้
- counts.denied_events เป็น null สำหรับ UNSW ต้องซ่อน panel ที่ unsupported หรือบอกว่าไม่รองรับ ไม่แสดงเป็น 0 denied
- timeline/network_identifiers/ports/model_inference/evaluation=false จึงซ่อน panel ที่เกี่ยวข้อง
- export endpoint เดิมยังส่ง “findings” เท่านั้น ไม่ใช่ flow export; อย่าใช้เป็นปุ่มส่งออก UNSW flows

## Types และ integration

อัปเดต types.ts ตาม contract จริง: source_type union, schema.sources, capabilities, labels nullable, inference, optional UNSW fields, counts.denied_events:number|null และ FlowRecord/paginated records รูปแบบ response เดิมของ FortiGate ยังเหมือนเดิม เพิ่มฟิลด์อย่าง backward-compatible
- ข้อมูลตัวอย่างใน docs/web/examples เป็น test fixtures เท่านั้น ห้ามใช้แทนผลจริงเมื่อ API error
- summary.mode ยัง deterministic และ chat_available ยังอยู่ใน schema; ไม่มี LLM/chat ใหม่
- relative /api, credentials same-origin, Vite proxy changeOrigin:false เหมือนเดิม
- จัดการ 408/409/410/413/422/429 และหยุด polling บน terminal state/unmount

## งานตรวจที่ต้องทำต่อจากรายงานเดิม

- เพิ่ม tests สำหรับเลือก source แล้วส่ง source_type ถูกต้อง, demo/sample ตาม source, UNSW labeled/unlabeled, labels ไม่แสดงเป็น predictions, null/unsupported panels ไม่ขึ้นเป็นข้อมูลปลอม, records pagination และเปลี่ยน source แล้วล้าง state
- ตรวจ Vite dev proxy ที่ 127.0.0.1:5173 กับ backend 8000 จริง
- ทดลอง file picker ในเบราว์เซอร์กับ synthetic sample ของทั้งสอง source
- ตรวจ focus trap/คืน focus และ Escape ของ drawer, layout 390px และ >=1280px, print/PDF ด้วยตาเมื่อเครื่องมือทำได้
- ถ้าปรับแสดงเวลา Asia/Bangkok ให้ label timezone และยังระบุ unverified epoch-seconds assumption ของ FortiGate; UNSW ไม่มีเวลาจริง
- JS chunk warning ให้พิจารณา lazy loading/splitting เท่าที่จำเป็น ไม่เพิ่ม globe/ไลบรารีใหญ่หรือ refactor ยกชุด
- รัน typecheck/tests/build และ flow จริงสอง source เก็บผลตามจริง อย่าอ้างว่าตรวจสิ่งที่ยังไม่ได้ตรวจ

เมื่อเสร็จ ส่งรายการไฟล์ คำสั่งและผลทดสอบ ช่องว่างที่เหลือ และ git status กลับมา ไม่ commit/push/merge เข้า main หรือ deploy อัตโนมัติ
