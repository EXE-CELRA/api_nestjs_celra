import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtpEmail(toEmail: string, toName: string, otpCode: string): Promise<boolean> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const senderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL');
    const senderName = this.configService.get<string>('BREVO_SENDER_NAME') || 'CELRA Compliance';

    const url = 'https://api.brevo.com/v3/smtp/email';

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject: `[CELRA] Mã xác thực OTP của bạn: ${otpCode}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0052cc; text-align: center; margin-bottom: 8px;">Xác Thực Tài Khoản CELRA</h2>
          <p style="color: #334155; font-size: 14px;">Xin chào <strong>${toName || 'Quý khách'}</strong>,</p>
          <p style="color: #334155; font-size: 14px;">Bạn đang thực hiện đăng ký tài khoản doanh nghiệp trên nền tảng CELRA. Mã xác thực OTP của bạn là:</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0052cc; background-color: #eff6ff; padding: 12px 28px; border-radius: 8px; border: 1px dashed #3b82f6; display: inline-block;">
              ${otpCode}
            </span>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
            • Mã này có hiệu lực trong vòng <strong>5 phút</strong>.<br/>
            • Tuyệt đối không cung cấp mã OTP này cho bất kỳ ai để bảo vệ an toàn thông tin doanh nghiệp.
          </p>
        </div>
      `,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
          'api-key': apiKey || '',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`Brevo gửi email thất bại: ${JSON.stringify(errorData)}`);
        return false;
      }

      this.logger.log(`Đã gửi mã OTP thành công tới: ${toEmail}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Lỗi kết nối tới Brevo API: ${error.message}`);
      return false;
    }
  }

  async sendResetPasswordOtpEmail(toEmail: string, toName: string, otpCode: string): Promise<boolean> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const senderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL');
    const senderName = this.configService.get<string>('BREVO_SENDER_NAME') || 'CELRA Compliance';

    const url = 'https://api.brevo.com/v3/smtp/email';

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject: `[CELRA] Mã xác thực OTP khôi phục mật khẩu: ${otpCode}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0052cc; text-align: center; margin-bottom: 8px;">Khôi Phục Mật Khẩu CELRA</h2>
          <p style="color: #334155; font-size: 14px;">Xin chào <strong>${toName || 'Quý khách'}</strong>,</p>
          <p style="color: #334155; font-size: 14px;">Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với email này. Mã xác thực OTP của bạn là:</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0052cc; background-color: #eff6ff; padding: 12px 28px; border-radius: 8px; border: 1px dashed #3b82f6; display: inline-block;">
              ${otpCode}
            </span>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
            • Mã này có hiệu lực trong vòng <strong>5 phút</strong>.<br/>
            • Tuyệt đối không chia sẻ mã này cho bất kỳ ai. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua thư này.
          </p>
        </div>
      `,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
          'api-key': apiKey || '',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error(`Brevo gửi email khôi phục mật khẩu thất bại: ${JSON.stringify(errorData)}`);
        return false;
      }

      this.logger.log(`Đã gửi mã OTP khôi phục mật khẩu thành công tới: ${toEmail}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Lỗi kết nối tới Brevo API: ${error.message}`);
      return false;
    }
  }
}
