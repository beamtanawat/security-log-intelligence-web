# Frontend handoff

Backend branch: `codex/portfolio-foundations`. Read `api-contract.md` first; preserve user work and coordinate integration.

- FortiGate anomaly row N: GET `/api/analyses/{id}/findings?source_record_number=N` returns same-session findings for the same source row, with existing pagination and filters. Empty results do not establish safety. See `examples/findings-record-1.json`.
- DELETE `/api/analyses/{id}` deletes temporary results owned by the current session. It returns 204, 409 `ANALYSIS_IN_USE`, 410 expired/deleted, 404 foreign/unknown, or 403 rejected origin. Remove recent entry only after 204/410. This does not yet implement persistent account history.
- Add appropriate loading/empty/error states, protect UNSW from FortiGate-only UI and preserve disclaimers. Run typecheck, frontend tests and build, then test with the actual backend before integration.

Backend เพิ่ม `GET /api/analyses/{id}/issues?offset=0&limit=50` สำหรับทั้งสอง source พร้อม `capabilities.quality_details`; แต่ละ item แสดง source_record_number และ issues ที่มี field/code/status/description ไม่ส่งค่า raw ให้แยก ACTUAL_INVALID จาก UNKNOWN/EXPECTED; total นับแถวที่มี issue ไม่ใช่จำนวน issue ทั้งหมด ดูตัวอย่าง `examples/issues.json` และเพิ่มหน้า/รายการ Data quality ที่แสดง record และ field อย่างมี pagination พร้อม empty/error states
