# คู่มือ log ตัวอย่าง

ระบบรองรับ CSV แบบ **FortiGate** และ **UNSW-NB15 prepared** เท่านั้น เลือกชนิดบนหน้า Upload ให้ตรงกับไฟล์ แล้วใช้ **Try synthetic demo** เพื่อทดลองวิเคราะห์ หรือ **Download sample CSV** เพื่อดาวน์โหลดไฟล์ตัวอย่างของชนิดนั้น ไฟล์ตัวอย่างสร้างขึ้นใหม่ ไม่มีแถว log จริง

## FortiGate

- เลือก **FortiGate CSV**: header ต้องมีครบตาม schema ที่ `/api/schema` ระบุ แม้บางค่าของแต่ละแถวอาจว่างได้
- ตัวอย่าง field ที่ใช้: `itime`, `src_ip`, `dst_ip`, `src_port`, `dst_port`, `net_proto`, `event_action`, `event_subtype`, `app_service`, `net_sentbytes`, `net_recvbytes`, `net_sentpkts`, `net_rcvdpkts`, `net_sessionduration`
- demo สังเคราะห์มี 24 แถว ใช้ทดลองดู rule findings และ anomaly score เมื่อมีโมเดลพร้อม การถูกปฏิเสธหรือได้คะแนนผิดปกติไม่ได้ยืนยันการโจมตี
- ดู/ดาวน์โหลดตัวอย่าง: `/api/sample?source_type=fortigate`

## UNSW-NB15

- เลือก **UNSW-NB15 prepared CSV**: ต้องมี predictive columns 28 ช่องตาม schema เช่น `dur`, `spkts`, `dpkts`, `sbytes`, `dbytes`, `rate`, `proto`, `service`, `state`
- `label`, `attack_cat` และ `id` เป็น optional; labels เป็นข้อมูลที่มากับไฟล์ ไม่ใช่ผลทำนาย และไม่ถูกใช้เป็น predictive features
- demo มี 12 แถวและสร้าง label สังเคราะห์ NORMAL 8 / ATTACK 4 โดยเลือก feature patterns ให้ทดสอบผลทำนายทั้งสองแบบ จึง **ห้ามใช้ตัวเลขนี้วัด accuracy/F1**
- ตัวอย่าง CSV: [unsw-demo-mixed.csv](../../examples/synthetic/unsw-demo-mixed.csv) หรือ `/api/sample?source_type=unsw_nb15`

## ข้อควรรู้

ไฟล์จำกัด 10 MiB และ 50,000 แถว ผลวิเคราะห์เป็นข้อมูลชั่วคราวและหายเมื่อ service restart ใช้เฉพาะข้อมูลสังเคราะห์หรือปกปิดข้อมูลสำคัญแล้ว ค่า invalid อาจทำให้บางแถวเป็น unscored; ถ้าโครงสร้างไฟล์ผิดทั้งชุด job จะล้มเหลวพร้อม error code โปรดดู [API contract](api-contract.md) สำหรับรายละเอียด schema และข้อจำกัด
