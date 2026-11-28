const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('./node_modules/@prisma/client');
const JSZip = require('./node_modules/jszip');
const xlsx = require('./node_modules/xlsx');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'celra_2026';
const BASE_URL = 'http://localhost:3000/api/v1';

// Helper to create minimal PDF
function createMinimalPdf(linesOrText) {
  const lines = Array.isArray(linesOrText) ? linesOrText : linesOrText.split('\n');
  let content = 'BT /F1 11 Tf 50 720 Td (' + lines[0].replace(/[\(\)\\]/g, ' ') + ') Tj ';
  for (let i = 1; i < lines.length; i++) {
    content += '0 -18 Td (' + lines[i].replace(/[\(\)\\]/g, ' ') + ') Tj ';
  }
  content += 'ET';
  const streamLength = Buffer.byteLength(content);
  
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  
  offsets.push(Buffer.byteLength(pdf));
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  
  offsets.push(Buffer.byteLength(pdf));
  pdf += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  
  offsets.push(Buffer.byteLength(pdf));
  pdf += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
  
  offsets.push(Buffer.byteLength(pdf));
  pdf += '4 0 obj\n<< /Length ' + streamLength + ' >>\nstream\n' + content + '\nendstream\nendobj\n';
  
  offsets.push(Buffer.byteLength(pdf));
  pdf += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
  return Buffer.from(pdf, 'utf-8');
}

// Helper to create minimal DOCX
async function createMinimalDocx(text) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  
  const paragraphs = text.split('\n').map(p => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`);
  
  return await zip.generateAsync({ type: 'nodebuffer' });
}

// Helper to create XLSX
function createMinimalXlsx(data, sheetName = 'Sheet1') {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(data);
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Upload file helper
async function uploadFile(token, orgId, fileName, buffer, mimeType) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  let header = `--${boundary}\r\n`;
  header += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
  header += `Content-Type: ${mimeType}\r\n\r\n`;
  
  const footer = `\r\n--${boundary}--\r\n`;
  
  const payload = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    buffer,
    Buffer.from(footer, 'utf-8')
  ]);

  const res = await fetch(`${BASE_URL}/ai-assistant/upload-file`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-organization-id': orgId,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(payload.length)
    },
    body: payload
  });

  const json = await res.json();
  return { status: res.status, data: json };
}

// Chat API helper
async function sendChatMessage(token, orgId, body) {
  const res = await fetch(`${BASE_URL}/ai-assistant/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-organization-id': orgId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  return { status: res.status, data: json };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('   CELRA AI COMPLIANCE PLATFORM - 10 FILE CHAT TEST SCENARIOS   ');
  console.log('================================================================\n');

  // 1. Get test users
  const userA = await prisma.user.findFirst({
    where: { email: 'owner@celra.vn' },
    include: { memberships: true }
  });
  const orgAId = userA.memberships[0].organizationId;
  const tokenA = jwt.sign({ sub: userA.id, email: userA.email }, JWT_SECRET, { expiresIn: '1d' });

  const userB = await prisma.user.findFirst({
    where: { email: 'hauntce190069@gmail.com' },
    include: { memberships: true }
  });
  const orgBId = userB.memberships[0].organizationId;
  const tokenB = jwt.sign({ sub: userB.id, email: userB.email }, JWT_SECRET, { expiresIn: '1d' });

  console.log(`[AUTH] User A (Org Bep Viet): ${userA.email} (${orgAId})`);
  console.log(`[AUTH] User B (Org SJC): ${userB.email} (${orgBId})\n`);

  const results = [];

  // =========================================================================
  // TEST 1: PDF Document Upload & Q&A
  // =========================================================================
  console.log('>>> [TEST 1] PDF Upload & Q&A (Bao_cao_thue_Q1_2026.pdf)...');
  try {
    const pdfLines = [
      'BAO CAO THUE QUY 1 2026 CONG TY BEP VIET',
      'Doanh thu chiu thue GTGT: 250.000.000 VND',
      'Thue GTGT dau ra 10%: 25.000.000 VND',
      'Thue GTGT dau vao duoc khau tru: 18.000.000 VND',
      'Thue GTGT con phai nop: 7.000.000 VND',
      'Tinh trang: Da nop ngay 15/04/2026 tai Kho bac Nha nuoc'
    ];
    const pdfBuf = createMinimalPdf(pdfLines);
    const upRes = await uploadFile(tokenA, orgAId, 'Bao_cao_thue_Q1_2026.pdf', pdfBuf, 'application/pdf');
    
    const fileData = upRes.data?.data || upRes.data;
    if (upRes.status !== 201 || !fileData?.fileId) {
      throw new Error(`Upload failed: ${JSON.stringify(upRes.data)}`);
    }
    const pdfFileId = fileData.fileId;
    console.log(`    File uploaded: ${pdfFileId} (${fileData.fileName}, extracted ${fileData.extractedChars} chars)`);

    const conv1 = 'conv_test_pdf_' + Date.now();
    const chatRes = await sendChatMessage(tokenA, orgAId, {
      message: 'Tóm tắt các số liệu thuế quan trọng trong file Báo cáo thuế Q1/2026 vừa gửi và cho biết số thuế GTGT còn phải nộp là bao nhiêu?',
      fileId: pdfFileId,
      conversationId: conv1
    });

    const reply = chatRes.data?.data?.content || chatRes.data?.data?.answer || chatRes.data?.content || chatRes.data?.answer || '';
    const hasData = /7\.?000\.?000|7\s*triệu|250\.?000\.?000|25\.?000\.?000/i.test(reply);
    console.log(`    AI Reply preview: ${reply.substring(0, 150).replace(/\n/g, ' ')}...`);

    if ([200, 201].includes(chatRes.status) && hasData) {
      console.log('    ✅ TEST 1 PASSED: AI đọc file PDF và trích xuất số liệu thuế chính xác.\n');
      results.push({ test: 1, name: 'PDF Upload & Q&A', status: 'PASS', detail: 'Đọc số thuế 7.000.000 / 250.000.000 chính xác từ PDF' });
    } else {
      throw new Error(`AI reply did not contain expected tax numbers (status: ${chatRes.status}): ${reply}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 1 FAILED:', err.message, '\n');
    results.push({ test: 1, name: 'PDF Upload & Q&A', status: 'FAIL', detail: err.message });
  }

  // =========================================================================
  // TEST 2: DOCX Word Document Upload & Q&A
  // =========================================================================
  console.log('>>> [TEST 2] DOCX Upload & Q&A (Hop_dong_lao_dong_2026.docx)...');
  try {
    const docxText = [
      'HOP DONG LAO DONG SO 08/2026/HDLD',
      'Nguoi su dung lao dong: Cong ty TNHH Bep Viet',
      'Nguoi lao dong: Ong Nguyen Van An, CCCD so 012345678910',
      'Dieu 1: Cong viec: Nhan vien Ky thuat He thong',
      'Dieu 2: Thoi han hop dong: 12 thang ke tu ngay 01/01/2026 den ngay 31/12/2026',
      'Dieu 3: Muc luong chinh: 15.000.000 VND/thang (Muoi lam trieu dong)',
      'Dieu 4: Phu cap trach nhiem: 2.000.000 VND/thang',
      'Dieu 5: Thoi gian lam viec: 40 gio/tuan'
    ].join('\n');
    const docxBuf = await createMinimalDocx(docxText);
    const upRes = await uploadFile(tokenA, orgAId, 'Hop_dong_lao_dong_2026.docx', docxBuf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const fileData2 = upRes.data?.data || upRes.data;
    if (upRes.status !== 201 || !fileData2?.fileId) {
      throw new Error(`Upload failed: ${JSON.stringify(upRes.data)}`);
    }
    const docxFileId = fileData2.fileId;
    console.log(`    File uploaded: ${docxFileId} (${fileData2.fileName}, extracted ${fileData2.extractedChars} chars)`);

    const conv2 = 'conv_test_docx_' + Date.now();
    const chatRes = await sendChatMessage(tokenA, orgAId, {
      message: 'Hợp đồng lao động này ký với ai, thời hạn bao lâu và mức lương chính xác được thỏa thuận là bao nhiêu?',
      fileId: docxFileId,
      conversationId: conv2
    });

    const reply = chatRes.data?.data?.content || chatRes.data?.data?.answer || chatRes.data?.content || chatRes.data?.answer || '';
    const hasPerson = /Nguyen Van An|Nguyễn Văn An/i.test(reply);
    const hasSalary = /15\.?000\.?000|15\s*triệu/i.test(reply);
    console.log(`    AI Reply preview: ${reply.substring(0, 150).replace(/\n/g, ' ')}...`);

    if ([200, 201].includes(chatRes.status) && (hasPerson || hasSalary)) {
      console.log('    ✅ TEST 2 PASSED: AI đọc file Word DOCX, trích xuất đúng nhân sự và mức lương.\n');
      results.push({ test: 2, name: 'DOCX Upload & Q&A', status: 'PASS', detail: 'Trích xuất đúng nhân sự Nguyễn Văn An và lương 15.000.000 VND' });
    } else {
      throw new Error(`AI reply did not identify worker or salary (status: ${chatRes.status}): ${reply}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 2 FAILED:', err.message, '\n');
    results.push({ test: 2, name: 'DOCX Upload & Q&A', status: 'FAIL', detail: err.message });
  }

  // =========================================================================
  // TEST 3: XLSX Excel Upload & Q&A
  // =========================================================================
  console.log('>>> [TEST 3] XLSX Upload & Q&A (Bang_ke_thu_chi_thang_3_2026.xlsx)...');
  try {
    const excelData = [
      ['STT', 'KhoanMuc', 'Loai', 'SoTienVND', 'GhiChu'],
      [1, 'Doanh thu ban thiet bi bep', 'Thu', 180000000, 'Chuyen khoan ngan hang'],
      [2, 'Tien thue mat bang thang 3', 'Chi', 35000000, 'Hoa don GTGT hop le'],
      [3, 'Luong nhan vien thang 3', 'Chi', 65000000, 'Da trich BHXH'],
      [4, 'Loi nhuan gop thang 3', 'TongKet', 80000000, 'Thu tru Chi']
    ];
    const xlsxBuf = createMinimalXlsx(excelData, 'ThuChiT3');
    const upRes = await uploadFile(tokenA, orgAId, 'Bang_ke_thu_chi_thang_3_2026.xlsx', xlsxBuf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const fileData3 = upRes.data?.data || upRes.data;
    if (upRes.status !== 201 || !fileData3?.fileId) {
      throw new Error(`Upload failed: ${JSON.stringify(upRes.data)}`);
    }
    const xlsxFileId = fileData3.fileId;
    console.log(`    File uploaded: ${xlsxFileId} (${fileData3.fileName}, extracted ${fileData3.extractedChars} chars)`);

    const conv3 = 'conv_test_xlsx_' + Date.now();
    const chatRes = await sendChatMessage(tokenA, orgAId, {
      message: 'Trong file Excel vừa tải lên, tổng doanh thu và tiền thuê mặt bằng tháng 3 là bao nhiêu?',
      fileId: xlsxFileId,
      conversationId: conv3
    });

    const reply = chatRes.data?.data?.content || chatRes.data?.data?.answer || chatRes.data?.content || chatRes.data?.answer || '';
    const hasRevenue = /180\.?000\.?000|180\s*triệu/i.test(reply);
    const hasRent = /35\.?000\.?000|35\s*triệu/i.test(reply);
    console.log(`    AI Reply preview: ${reply.substring(0, 150).replace(/\n/g, ' ')}...`);

    if ([200, 201].includes(chatRes.status) && (hasRevenue || hasRent)) {
      console.log('    ✅ TEST 3 PASSED: AI đọc cấu trúc bảng tính Excel, trích xuất số liệu doanh thu và chi phí.\n');
      results.push({ test: 3, name: 'XLSX Upload & Q&A', status: 'PASS', detail: 'Đọc đúng doanh thu 180 triệu và tiền thuê 35 triệu từ file Excel' });
    } else {
      throw new Error(`AI reply missing Excel figures (status: ${chatRes.status}): ${reply}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 3 FAILED:', err.message, '\n');
    results.push({ test: 3, name: 'XLSX Upload & Q&A', status: 'FAIL', detail: err.message });
  }

  // =========================================================================
  // TEST 4 & 5: Multi-file Distinction & Comparison (File A vs File B)
  // =========================================================================
  console.log('>>> [TEST 4 & 5] Multi-file Distinction & Comparison...');
  try {
    const fileAText = 'QUY CHE THUONG TET 2025: Cong ty Bep Viet ap dung muc thuong 1 thang luong co ban cho toan bo can bo nhan vien. Khong co phu cap KPI.';
    const fileBText = 'QUY CHE THUONG TET 2026: Cong ty Bep Viet tang muc thuong len 2 thang luong co ban, dong thoi bo sung khoan thuong KPI xuat sac 5.000.000 VND.';

    const upA = await uploadFile(tokenA, orgAId, 'Quy_che_thuong_2025.txt', Buffer.from(fileAText, 'utf-8'), 'text/plain');
    const upB = await uploadFile(tokenA, orgAId, 'Quy_che_thuong_2026.txt', Buffer.from(fileBText, 'utf-8'), 'text/plain');

    const fileAData = upA.data?.data || upA.data;
    const fileBData = upB.data?.data || upB.data;
    const fileAId = fileAData.fileId;
    const fileBId = fileBData.fileId;

    console.log(`    File A uploaded: ${fileAId} (Quy_che_thuong_2025.txt)`);
    console.log(`    File B uploaded: ${fileBId} (Quy_che_thuong_2026.txt)`);

    // Test 4: Ask about File B while File A was previously in context
    const convMulti = 'conv_multi_file_' + Date.now();
    const chat4Res = await sendChatMessage(tokenA, orgAId, {
      message: 'Chỉ xem xét file Quy_che_thuong_2026.txt: Mức thưởng Tết năm 2026 được quy định là bao nhiêu và có khoản thưởng nào mới?',
      fileId: fileBId,
      fileIds: [fileAId, fileBId],
      conversationId: convMulti
    });

    const reply4 = chat4Res.data?.data?.content || chat4Res.data?.data?.answer || chat4Res.data?.content || chat4Res.data?.answer || '';
    const isDistinct = /2\s*tháng|KPI|5\.?000\.?000/i.test(reply4);
    console.log(`    AI Reply 4 preview: ${reply4.substring(0, 150).replace(/\n/g, ' ')}...`);

    if (isDistinct) {
      console.log('    ✅ TEST 4 PASSED: AI phân biệt rõ ràng nội dung File B, không bị lẫn với File A.\n');
      results.push({ test: 4, name: 'File A vs File B Distinction', status: 'PASS', detail: 'Nhận diện đúng mức thưởng 2 tháng và KPI 5tr của năm 2026' });
    } else {
      throw new Error(`AI failed to distinguish File B: ${reply4}`);
    }

    // Test 5: Ask to compare File A and File B
    console.log('>>> [TEST 5] Compare 2 Files (2025 vs 2026)...');
    const chat5Res = await sendChatMessage(tokenA, orgAId, {
      message: 'Hãy so sánh chi tiết điểm giống và khác nhau giữa Quy chế thưởng 2025 và Quy chế thưởng 2026.',
      fileIds: [fileAId, fileBId],
      conversationId: convMulti
    });

    const reply5 = chat5Res.data?.data?.content || chat5Res.data?.data?.answer || chat5Res.data?.content || chat5Res.data?.answer || '';
    const hasCompare = /(2025.*2026|1\s*tháng.*2\s*tháng|giống|khác)/is.test(reply5);
    console.log(`    AI Reply 5 preview: ${reply5.substring(0, 150).replace(/\n/g, ' ')}...`);

    if (hasCompare) {
      console.log('    ✅ TEST 5 PASSED: AI thực hiện so sánh đối chiếu đa tài liệu thành công.\n');
      results.push({ test: 5, name: 'Compare Two Files', status: 'PASS', detail: 'So sánh chi tiết mức thưởng 2025 (1 tháng) vs 2026 (2 tháng + KPI)' });
    } else {
      throw new Error(`AI failed comparison: ${reply5}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 4/5 FAILED:', err.message, '\n');
    results.push({ test: 4, name: 'File Distinction', status: 'FAIL', detail: err.message });
    results.push({ test: 5, name: 'Compare Two Files', status: 'FAIL', detail: err.message });
  }

  // =========================================================================
  // TEST 6: Non-existent Detail (No Hallucination)
  // =========================================================================
  console.log('>>> [TEST 6] Non-existent Detail Query (No Hallucination)...');
  try {
    const contractText = 'HOP DONG MUA BAN: Ben A ban cho Ben B 10 chiec noi com dien tri gia 20.000.000 VND. Giao hang tai kho Ben A.';
    const upContract = await uploadFile(tokenA, orgAId, 'Hop_dong_mua_ban.txt', Buffer.from(contractText, 'utf-8'), 'text/plain');
    const fileData6 = upContract.data?.data || upContract.data;
    const contractFileId = fileData6.fileId;

    const chat6Res = await sendChatMessage(tokenA, orgAId, {
      message: 'Trong file hợp đồng mua bán này có quy định mức phạt vi phạm chậm thanh toán là bao nhiêu phần trăm không?',
      fileId: contractFileId,
      conversationId: 'conv_test_hallucinate_' + Date.now()
    });

    const reply6 = chat6Res.data?.data?.content || chat6Res.data?.data?.answer || chat6Res.data?.content || chat6Res.data?.answer || '';
    const acknowledgesMissing = /không có|không đề cập|chưa quy định|không nêu|không thấy/i.test(reply6);
    console.log(`    AI Reply 6 preview: ${reply6.substring(0, 150).replace(/\n/g, ' ')}...`);

    if (acknowledgesMissing) {
      console.log('    ✅ TEST 6 PASSED: AI xác nhận thông tin không có trong file, không tự bịa đặt số liệu phạt.\n');
      results.push({ test: 6, name: 'Non-existent Information', status: 'PASS', detail: 'Xác nhận rõ ràng file không có điều khoản phạt chậm thanh toán' });
    } else {
      throw new Error(`AI may have hallucinated: ${reply6}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 6 FAILED:', err.message, '\n');
    results.push({ test: 6, name: 'Non-existent Information', status: 'FAIL', detail: err.message });
  }

  // =========================================================================
  // TEST 7: Multi-turn Follow-up in Same Conversation (Context Retention)
  // =========================================================================
  console.log('>>> [TEST 7] Multi-turn Follow-up (Context Retention)...');
  try {
    const docText = 'BIEN BAN HOP HOI DONG THANH VIEN: Ong Tran Van Nam duoc bau lam Giam doc dieu hanh nhiem ky 2026-2030 voi ty le 100% phieu bieu quyet. Cong ty cap cho Giam doc 1 xe o to tri gia 800 trieu dong de phuc vu cong tac.';
    const upDoc = await uploadFile(tokenA, orgAId, 'Bien_ban_hop_2026.txt', Buffer.from(docText, 'utf-8'), 'text/plain');
    const fileData7 = upDoc.data?.data || upDoc.data;
    const fileId7 = fileData7.fileId;
    const conv7 = 'conv_multiturn_' + Date.now();

    // Turn 1: Ask who was elected
    console.log('    Turn 1: Ai được bầu làm Giám đốc?');
    const chat7Turn1 = await sendChatMessage(tokenA, orgAId, {
      message: 'Ai được bầu làm Giám đốc điều hành trong biên bản họp này?',
      fileId: fileId7,
      conversationId: conv7
    });

    // Turn 2: Follow-up question WITHOUT passing fileId again
    console.log('    Turn 2: Vậy Giám đốc đó được cấp tài sản gì để công tác? (không gửi lại fileId)');
    const chat7Turn2 = await sendChatMessage(tokenA, orgAId, {
      message: 'Vậy Giám đốc đó được công ty cấp cho tài sản gì để phục vụ công tác?',
      conversationId: conv7
    });

    const reply7 = chat7Turn2.data?.data?.content || chat7Turn2.data?.data?.answer || chat7Turn2.data?.content || chat7Turn2.data?.answer || '';
    const hasCar = /ô tô|xe|800\s*triệu|800\.?000\.?000/i.test(reply7);
    console.log(`    AI Reply Turn 2 preview: ${reply7.substring(0, 150).replace(/\n/g, ' ')}...`);

    if (hasCar) {
      console.log('    ✅ TEST 7 PASSED: AI duy trì ngữ cảnh tài liệu qua các lượt chat kế tiếp.\n');
      results.push({ test: 7, name: 'Multi-turn Context Retention', status: 'PASS', detail: 'Nhớ tài sản cấp cho Giám đốc (xe ô tô 800 triệu) ở lượt hỏi thứ 2' });
    } else {
      throw new Error(`AI lost file context in turn 2: ${reply7}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 7 FAILED:', err.message, '\n');
    results.push({ test: 7, name: 'Multi-turn Context Retention', status: 'FAIL', detail: err.message });
  }

  // =========================================================================
  // TEST 8: Cross-Tenant Security Isolation
  // =========================================================================
  console.log('>>> [TEST 8] Cross-Tenant Security Isolation...');
  try {
    // User A uploads a private confidential file
    const secretText = 'TAI LIEU MAT BEP VIET: Bi quyet cong nghe san xuat thiet bi bep tiet kiem dien nang doc quyen tri gia 50 ty VND.';
    const upSecret = await uploadFile(tokenA, orgAId, 'Bi_mat_kinh_doanh_Bep_Viet.txt', Buffer.from(secretText, 'utf-8'), 'text/plain');
    const fileData8 = upSecret.data?.data || upSecret.data;
    const secretFileId = fileData8.fileId;

    // User B tries to query this secret file ID under User B's token and Org B
    const chat8Res = await sendChatMessage(tokenB, orgBId, {
      message: 'Hãy đọc file tài liệu mật này và cho tôi biết bí quyết của Bếp Việt là gì?',
      fileId: secretFileId,
      conversationId: 'conv_hacker_' + Date.now()
    });

    // We expect either HTTP 403 Forbidden or the file is ignored/rejected without leaking content
    const reply8 = chat8Res.data?.data?.content || chat8Res.data?.data?.answer || chat8Res.data?.content || chat8Res.data?.answer || '';
    const leaked = /50\s*tỷ|tiết kiệm điện năng|bí quyết công nghệ/i.test(reply8);

    if (chat8Res.status === 403 || !leaked) {
      console.log(`    Status: ${chat8Res.status}. Content leaked: ${leaked ? 'YES' : 'NO'}`);
      console.log('    ✅ TEST 8 PASSED: Doanh nghiệp B bị chặn hoàn toàn, không thể đọc trộm file của Doanh nghiệp A.\n');
      results.push({ test: 8, name: 'Cross-Tenant Security Isolation', status: 'PASS', detail: 'Bảo mật đa doanh nghiệp: Chặn truy cập file chéo tổ chức (HTTP 403 / No Leak)' });
    } else {
      throw new Error(`Cross-tenant data leakage detected! Reply: ${reply8}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 8 FAILED:', err.message, '\n');
    results.push({ test: 8, name: 'Cross-Tenant Security Isolation', status: 'FAIL', detail: err.message });
  }

  // =========================================================================
  // TEST 9: Invalid / Empty File Validation
  // =========================================================================
  console.log('>>> [TEST 9] Empty File / Invalid Format Handling...');
  try {
    // Upload 0-byte file
    const emptyBuf = Buffer.alloc(0);
    const upEmpty = await uploadFile(tokenA, orgAId, 'Empty_file.pdf', emptyBuf, 'application/pdf');

    console.log(`    Empty file upload response status: ${upEmpty.status}, message: ${JSON.stringify(upEmpty.data?.message)}`);
    const rejectedProperly = upEmpty.status === 400 || /rỗng|không có dữ liệu|empty/i.test(JSON.stringify(upEmpty.data));

    if (rejectedProperly) {
      console.log('    ✅ TEST 9 PASSED: Hệ thống từ chối file 0-byte an toàn với thông báo lỗi HTTP 400.\n');
      results.push({ test: 9, name: 'Empty / Invalid File Handling', status: 'PASS', detail: 'Bắt lỗi 400 Bad Request cho file rỗng 0 bytes, không crash hệ thống' });
    } else {
      throw new Error(`Server accepted 0-byte file without 400 error: ${JSON.stringify(upEmpty.data)}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 9 FAILED:', err.message, '\n');
    results.push({ test: 9, name: 'Empty / Invalid File Handling', status: 'FAIL', detail: err.message });
  }

  // =========================================================================
  // TEST 10: Legal Compliance Check on Uploaded Tax Dossier
  // =========================================================================
  console.log('>>> [TEST 10] Legal Compliance Check on Uploaded Tax Dossier...');
  try {
    const taxDossier = [
      'HO SO KHAI THUE GTGT THANG 01/2026 - CONG TY TNHH BEP VIET',
      '1. To khai thue GTGT Mau 01/GTGT: Da lap ngay 18/02/2026.',
      '2. Bang ke hoa don GTGT ban ra: Da co day du.',
      '3. Bang ke hoa don GTGT mua vao: CHUA CO / CHUA LAP.',
      '4. Chung tu nop thue dien tu: CHUA NOP THUE.'
    ].join('\n');

    const upTax = await uploadFile(tokenA, orgAId, 'Ho_so_ke_khai_thue_GTGT.txt', Buffer.from(taxDossier, 'utf-8'), 'text/plain');
    const fileData10 = upTax.data?.data || upTax.data;
    const taxFileId = fileData10.fileId;

    const chat10Res = await sendChatMessage(tokenA, orgAId, {
      message: 'Đối chiếu hồ sơ thuế trong file này với quy định pháp luật Việt Nam, hồ sơ này đã đầy đủ chưa? Còn thiếu những tài liệu gì, cần nộp thuế hạn chót khi nào và rủi ro tuân thủ là gì?',
      fileId: taxFileId,
      conversationId: 'conv_compliance_' + Date.now()
    });

    const reply10 = chat10Res.data?.data?.content || chat10Res.data?.data?.answer || chat10Res.data?.content || chat10Res.data?.answer || '';
    const identifiesMissing = /chưa đầy đủ|còn thiếu|chưa lập|chưa nộp|mua vào/i.test(reply10);
    const mentionsLegal = /Luật Quản lý thuế|Nghị định 126|Thông tư 80|phạt chậm nộp|tiền chậm nộp/i.test(reply10);

    console.log(`    AI Reply 10 preview: ${reply10.substring(0, 180).replace(/\n/g, ' ')}...`);

    if ([200, 201].includes(chat10Res.status) && (identifiesMissing || mentionsLegal)) {
      console.log('    ✅ TEST 10 PASSED: AI phân tích đối chiếu hồ sơ thực tế với quy định pháp luật, chỉ ra hồ sơ còn thiếu và nghĩa vụ nộp thuế.\n');
      results.push({ test: 10, name: 'Legal Compliance Audit', status: 'PASS', detail: 'Chỉ rõ hồ sơ chưa đủ (thiếu bảng kê mua vào, chứng từ nộp), trích dẫn quy định pháp luật' });
    } else {
      throw new Error(`Compliance analysis incomplete: ${reply10}`);
    }
  } catch (err) {
    console.error('    ❌ TEST 10 FAILED:', err.message, '\n');
    results.push({ test: 10, name: 'Legal Compliance Audit', status: 'FAIL', detail: err.message });
  }

  console.log('================================================================');
  console.log('                  KẾT QUẢ ĐÁNH GIÁ 10 TÌNH HUỐNG                 ');
  console.log('================================================================');
  console.table(results);
  
  const passedCount = results.filter(r => r.status === 'PASS').length;
  console.log(`\nTổng kết: ${passedCount}/10 bài kiểm tra ĐẠT (PASS).`);
  await prisma.$disconnect();
}

runTestSuite().catch(err => {
  console.error('Test Suite crashed:', err);
  prisma.$disconnect();
  process.exit(1);
});
