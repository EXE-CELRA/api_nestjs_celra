import { PrismaClient } from '@prisma/client';
import {
  calculateComplianceDeadline,
} from '../src/common/utils/tax-calendar.util';

async function runTests() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TÍCH HỢP NGHIỆP VỤ CHECKLIST & TASK CELRA');
  console.log('================================================================\n');

  const prisma = new PrismaClient();

  try {
    // 1. KIỂM TRA TÍNH TOÁN DEADLINE PHÁP LÝ CHUẨN XÁC
    console.log('--- TEST 1: Kiểm tra tính hạn chót pháp lý ---');
    const now = new Date(2026, 9, 21); // 21/10/2026

    // a. Hàng tháng (Khai thuế GTGT)
    const monthlyGTGT = calculateComplianceDeadline('RULE-TAX-GTGT', 'MONTHLY', null, now);
    console.log('✓ Monthly GTGT (hạn ngày 20 tháng sau):', monthlyGTGT.dueDate?.toLocaleDateString('vi-VN'), 'PeriodKey:', monthlyGTGT.periodKey);
    if (!monthlyGTGT.dueDate || monthlyGTGT.dueDate.getDate() !== 20 || monthlyGTGT.dueDate.getMonth() !== 10) {
      throw new Error('Sai hạn tháng GTGT');
    }

    // b. Hàng quý (TNDN tạm nộp 80% Q3: hạn 30/10)
    const quarterlyTNDN = calculateComplianceDeadline('RULE-TAX-TNDN-80', 'QUARTERLY', null, now);
    console.log('✓ Quarterly TNDN (hạn 30/10):', quarterlyTNDN.dueDate?.toLocaleDateString('vi-VN'), 'PeriodKey:', quarterlyTNDN.periodKey);
    if (!quarterlyTNDN.dueDate || quarterlyTNDN.dueDate.getDate() !== 30 || quarterlyTNDN.dueDate.getMonth() !== 9) {
      throw new Error('Sai hạn TNDN 80%');
    }

    // c. 6 Tháng / Bán niên (Báo cáo lao động 05/12)
    const biannualLabor = calculateComplianceDeadline('RULE-LABOR-REPORT-6M', 'BIANNUAL_6M', null, now);
    console.log('✓ Biannual 6M (hạn 05/12):', biannualLabor.dueDate?.toLocaleDateString('vi-VN'), 'PeriodKey:', biannualLabor.periodKey);
    if (!biannualLabor.dueDate || biannualLabor.dueDate.getDate() !== 5 || biannualLabor.dueDate.getMonth() !== 11) {
      throw new Error('Sai hạn 6M');
    }

    // d. Cả năm (Môn bài 30/01)
    const annualMB = calculateComplianceDeadline('RULE-TAX-MB', 'ANNUAL', null, now);
    console.log('✓ Annual MB (hạn 30/01 năm sau):', annualMB.dueDate?.toLocaleDateString('vi-VN'), 'PeriodKey:', annualMB.periodKey);
    if (!annualMB.dueDate || annualMB.dueDate.getDate() !== 30 || annualMB.dueDate.getMonth() !== 0) {
      throw new Error('Sai hạn Môn bài');
    }

    // e. Tạm ngừng kinh doanh: TRƯỚC 03 ngày làm việc (trừ 3 ngày làm việc)
    const suspendEventDate = new Date(2026, 9, 30); // Thứ 6 ngày 30/10
    const suspendCalc = calculateComplianceDeadline('RULE-CORP-SUSPEND-3D', 'EVENT_3D', suspendEventDate, now);
    console.log('✓ Tạm ngừng KD (trước 3 ngày làm việc kể từ 30/10):', suspendCalc.dueDate?.toLocaleDateString('vi-VN'));
    if (!suspendCalc.dueDate || suspendCalc.dueDate.getTime() >= suspendEventDate.getTime()) {
      throw new Error('Hạn tạm ngừng phải trước ngày sự kiện!');
    }

    // f. Đợt 90 ngày góp vốn
    const estDate = new Date(2026, 0, 1);
    const capital90 = calculateComplianceDeadline('RULE-CORP-CAPITAL-90D', 'EVENT_90D', estDate, now);
    console.log('✓ Góp vốn 90 ngày (từ 01/01/2026):', capital90.dueDate?.toLocaleDateString('vi-VN'));

    // g. Đợt sự kiện thiếu ngày phát sinh -> Cảnh báo thiếu thông tin, không bịa hạn
    const missingEventCalc = calculateComplianceDeadline('RULE-CORP-AMEND-10D', 'EVENT_10D_BIZ', null, now);
    console.log('✓ Đợt sự kiện khi thiếu eventDate:', missingEventCalc.requiresEventDate ? 'Yêu cầu bổ sung ngày sự kiện (Đúng)' : 'Sai');
    if (!missingEventCalc.requiresEventDate || missingEventCalc.dueDate !== null) {
      throw new Error('Thiếu ngày sự kiện thì không được tự sinh dueDate');
    }

    // 2. KIỂM TRA IDEMPOTENCY & CHỐNG TRÙNG TASK TRONG DATABASE
    console.log('\n--- TEST 2: Kiểm tra Idempotency & Chống trùng Task trong DB ---');
    const testOrg = await prisma.organization.findFirst({
      include: { memberships: true },
    });

    if (!testOrg) {
      console.log('Không có organization mẫu trong DB, bỏ qua test ghi DB.');
      return;
    }

    console.log('Using Org:', testOrg.name, 'ID:', testOrg.id);

    const testRuleCode = 'RULE-TAX-TNDN-80';
    const testPeriodKey = '2026-Q4-TEST';

    // Tạo task lần 1
    const task1 = await prisma.task.upsert({
      where: {
        organizationId_ruleCode_periodKey: {
          organizationId: testOrg.id,
          ruleCode: testRuleCode,
          periodKey: testPeriodKey,
        },
      },
      update: { title: 'Updated Task Title 1' },
      create: {
        organizationId: testOrg.id,
        code: `TASK-${testRuleCode}-${testPeriodKey}`,
        title: 'Nhiệm vụ tạm nộp TNDN Q4 Test',
        category: 'Thuế',
        dueDate: new Date(2027, 0, 31),
        ruleCode: testRuleCode,
        periodCycle: 'QUARTERLY',
        periodKey: testPeriodKey,
        assigneeName: 'Chủ Doanh Nghiệp',
        description: 'Test task',
        legalBasis: 'Nghị định 91/2022',
      },
    });
    console.log('✓ Task 1 created with ID:', task1.id);

    // Tạo task lần 2 với cùng Org + RuleCode + PeriodKey
    const task2 = await prisma.task.upsert({
      where: {
        organizationId_ruleCode_periodKey: {
          organizationId: testOrg.id,
          ruleCode: testRuleCode,
          periodKey: testPeriodKey,
        },
      },
      update: { title: 'Updated Task Title 2' },
      create: {
        organizationId: testOrg.id,
        code: `TASK-${testRuleCode}-${testPeriodKey}`,
        title: 'Nhiệm vụ tạm nộp TNDN Q4 Test',
        category: 'Thuế',
        dueDate: new Date(2027, 0, 31),
        ruleCode: testRuleCode,
        periodCycle: 'QUARTERLY',
        periodKey: testPeriodKey,
        assigneeName: 'Chủ Doanh Nghiệp',
        description: 'Test task duplicate',
        legalBasis: 'Nghị định 91/2022',
      },
    });
    console.log('✓ Task 2 upserted with ID:', task2.id);

    if (task1.id !== task2.id) {
      throw new Error('Chống trùng thất bại: Đã sinh ra 2 task khác nhau cho cùng một kỳ!');
    }
    console.log('✓ CHỐNG TRÙNG THÀNH CÔNG: Cùng Org + RuleCode + PeriodKey chỉ tạo đúng 1 Task (ID khớp nhau)!');

    // 3. KIỂM TRA CHỐNG TRÙNG THÔNG BÁO NHẮC HẠN
    console.log('\n--- TEST 3: Kiểm tra Chống trùng Thông báo Nhắc hạn ---');
    const testUserId = testOrg.memberships[0]?.userId;
    if (testUserId) {
      const notif1 = await prisma.complianceNotification.upsert({
        where: {
          taskId_milestone_userId: {
            taskId: task1.id,
            milestone: 'BEFORE_3D',
            userId: testUserId,
          },
        },
        update: { message: 'Updated Reminder 1' },
        create: {
          organizationId: testOrg.id,
          userId: testUserId,
          taskId: task1.id,
          milestone: 'BEFORE_3D',
          title: 'Nhắc hạn 3 ngày',
          message: 'Còn 3 ngày đến hạn',
        },
      });

      const notif2 = await prisma.complianceNotification.upsert({
        where: {
          taskId_milestone_userId: {
            taskId: task1.id,
            milestone: 'BEFORE_3D',
            userId: testUserId,
          },
        },
        update: { message: 'Updated Reminder 2' },
        create: {
          organizationId: testOrg.id,
          userId: testUserId,
          taskId: task1.id,
          milestone: 'BEFORE_3D',
          title: 'Nhắc hạn 3 ngày lặp',
          message: 'Còn 3 ngày đến hạn lặp',
        },
      });

      if (notif1.id !== notif2.id) {
        throw new Error('Chống trùng thông báo thất bại!');
      }
      console.log('✓ CHỐNG TRÙNG THÔNG BÁO THÀNH CÔNG: Cùng Task + Milestone + User chỉ có 1 thông báo (ID khớp nhau)!');

      // Dọn dẹp dữ liệu test
      await prisma.complianceNotification.deleteMany({ where: { taskId: task1.id } });
    }
    await prisma.task.deleteMany({ where: { id: task1.id } });

    console.log('\n================================================================');
    console.log('🎉 TOÀN BỘ CÁC BÀI KIỂM THỬ ĐÃ THÀNH CÔNG 100%!');
    console.log('================================================================');
  } finally {
    await prisma.$disconnect();
  }
}

runTests().catch((e) => {
  console.error('❌ LỖI KIỂM THỬ:', e);
  process.exit(1);
});
