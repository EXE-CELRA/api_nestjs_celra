import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  UpdateProfileDto,
  SendOtpDto,
  ForgotPasswordSendOtpDto,
  VerifyOtpDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { UserRole } from '@prisma/client';
import { EmailService } from './email.service';

interface OtpStoreEntry {
  code: string;
  expiresAt: Date;
  attempts: number;
  lastSentAt: number;
}

interface ResetOtpStoreEntry extends OtpStoreEntry {
  verified?: boolean;
}

const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;

// Bộ nhớ đệm OTP toàn cục trong Process (Bảo toàn OTP kể cả khi NestJS re-compile / hot-reload)
const globalOtpStore = ((global as any).__CELRA_OTP_STORE__ =
  (global as any).__CELRA_OTP_STORE__ || new Map<string, OtpStoreEntry>());
const globalResetPasswordOtpStore = ((global as any).__CELRA_RESET_OTP_STORE__ =
  (global as any).__CELRA_RESET_OTP_STORE__ || new Map<string, ResetOtpStoreEntry>());
const globalForgotOtpCooldownStore = ((global as any).__CELRA_FORGOT_OTP_COOLDOWN__ =
  (global as any).__CELRA_FORGOT_OTP_COOLDOWN__ || new Map<string, number>());

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private otpStore: Map<string, OtpStoreEntry> = globalOtpStore;
  private resetPasswordOtpStore: Map<string, ResetOtpStoreEntry> = globalResetPasswordOtpStore;
  private forgotOtpCooldownStore: Map<string, number> = globalForgotOtpCooldownStore;
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,

  ) { }

  private generateSecureOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  private safeCompare(a: string, b: string): boolean {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }

  private isDebugOtpAllowed(): boolean {
    return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEBUG_OTP === 'true';
  }

  private isSafeAvatarUrl(avatar: string): boolean {
    if (avatar === '') return true;
    // Cho phép đường dẫn nội bộ tương đối nhưng chặn protocol-relative (//evil.com)
    if (avatar.startsWith('/') && !avatar.startsWith('//')) {
      return true;
    }
    // Cho phép data URI ảnh raster an toàn (chặn SVG để tránh XSS)
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(avatar)) {
      return avatar.length <= 500_000;
    }
    try {
      const parsed = new URL(avatar);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private enrichUserWithVietnamese(user: any) {
    if (!user) return user;
    return {
      ...user,
      hoVaTen: user.name,
      soDienThoai: user.phone,
      vaiTro: user.role,
      chucDanh: user.roleTitle,
      anhDaiDien: user.avatar,
      taoLuc: user.createdAt,
    };
  }
  async sendRegisterOtp(dto: SendOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const existingOtp = this.otpStore.get(email);
    if (existingOtp && Date.now() - existingOtp.lastSentAt < OTP_RESEND_COOLDOWN_MS) {
      throw new BadRequestException('Vui lòng đợi 60 giây trước khi yêu cầu gửi lại mã OTP');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('Email này đã được sử dụng trong hệ thống');
    }
    const otpCode = this.generateSecureOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    this.otpStore.set(email, {
      code: otpCode,
      expiresAt,
      attempts: 0,
      lastSentAt: Date.now(),
    });

    let sent = false;
    try {
      sent = await this.emailService.sendOtpEmail(email, dto.name || 'Quý khách', otpCode);
    } catch (e: any) {
      this.logger.error(`Lỗi gửi email: ${e.message}`);
    }

    if (sent) {
      return {
        success: true,
        message: 'Mã xác thực OTP đã được gửi về email của bạn',
      };
    }

    if (this.isDebugOtpAllowed()) {
      this.logger.warn(`=======================================================`);
      this.logger.warn(`🔑 [DEV FALLBACK] MÃ OTP ĐĂNG KÝ CHO [${email}]: ${otpCode}`);
      this.logger.warn(`=======================================================`);

      return {
        success: true,
        message: 'Mã xác thực OTP đã được tạo (Môi trường Thử nghiệm)',
        debugOtp: otpCode,
      };
    }

    this.otpStore.delete(email);
    throw new ServiceUnavailableException(
      'Không thể gửi email xác thực lúc này, vui lòng thử lại sau',
    );
  }
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const inputOtp = String(dto.otp || '').trim();
    const allowMasterOtp =
      process.env.NODE_ENV === 'test' ||
      (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_MASTER_OTP === 'true');

    // Chỉ cho phép mã xác thực test/dev dự phòng khi bật rõ cờ cho phép
    const isMasterOtp = allowMasterOtp && (inputOtp === '123456' || inputOtp === '999999');

    const storedOtp = this.otpStore.get(email);
    if (!storedOtp && !isMasterOtp) {
      throw new BadRequestException('Vui lòng lấy mã OTP xác thực trước khi đăng ký (hoặc bấm "Gửi lại OTP")');
    }

    if (storedOtp) {
      if (new Date() > storedOtp.expiresAt && !isMasterOtp) {
        this.otpStore.delete(email);
        throw new BadRequestException('Mã OTP đã hết hạn, vui lòng bấm "Gửi lại OTP" để nhận mã mới');
      }
      if (!this.safeCompare(storedOtp.code, inputOtp) && !isMasterOtp) {
        storedOtp.attempts = (storedOtp.attempts || 0) + 1;
        if (storedOtp.attempts >= OTP_MAX_ATTEMPTS) {
          this.otpStore.delete(email);
          throw new BadRequestException(
            'Bạn đã nhập sai mã OTP quá 3 lần. Vui lòng yêu cầu gửi mã OTP mới',
          );
        }
        throw new BadRequestException('Mã xác thực OTP không chính xác');
      }
      this.otpStore.delete(email);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('Email này đã được sử dụng trong hệ thống');
    }

    const rawPassword = dto.password;
    if (!rawPassword) {
      throw new BadRequestException('Mật khẩu không được để trống');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(rawPassword, saltRounds);

    const userName = dto.name || 'Người dùng';
    const userPhone = dto.phone;
    const requestedRole = dto.role || UserRole.owner;
    // Chặn leo thang đặc quyền: Không cho phép tự đăng ký tài khoản có quyền admin
    const userRole = requestedRole === UserRole.admin ? UserRole.owner : requestedRole;
    const userRoleTitle = dto.roleTitle || 'Chủ doanh nghiệp';
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: userName,
        role: userRole,
        roleTitle: userRoleTitle,
        phone: userPhone,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleTitle: true,
        avatar: true,
        phone: true,
        isTwoFactorEnabled: true,
        createdAt: true,
      },
    });

    const token = await this.generateToken(user);

    return {
      user: this.enrichUserWithVietnamese(user),
      accessToken: token,
    };
  }

  async login(dto: LoginDto) {
    const envAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const envAdminPassword = process.env.ADMIN_PASSWORD?.trim();
    const rawPassword = dto.password;
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Chỉ cho phép đăng nhập Super Admin khi ĐÃ CẤU HÌNH rõ ràng trong .env (Tuyệt đối không dùng fallback gán cứng)
    if (envAdminEmail && envAdminPassword && normalizedEmail === envAdminEmail) {
      if (!rawPassword || !this.safeCompare(rawPassword, envAdminPassword)) {
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }
      const virtualAdmin = {
        id: 'admin-virtual-system-id',
        email: envAdminEmail,
        name: process.env.ADMIN_DEFAULT_NAME || 'Quản Trị Viên Hệ Thống CELRA',
        role: UserRole.admin,
        roleTitle: 'Super Administrator',
        avatar: null,
        phone: '0987654321',
        isTwoFactorEnabled: false,
        createdAt: new Date(),
        isSuperAdmin: true,
      };

      const token = await this.generateToken(virtualAdmin);

      return {
        user: this.enrichUserWithVietnamese(virtualAdmin),
        accessToken: token,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (!rawPassword) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const isPasswordValid = await bcrypt.compare(rawPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const token = await this.generateToken(user);

    const { passwordHash: _, ...safeUser } = user;

    return {
      user: this.enrichUserWithVietnamese(safeUser),
      accessToken: token,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const oldPassword = dto.oldPassword;
    const newPassword = dto.newPassword;

    if (!oldPassword || !newPassword) {
      throw new BadRequestException('Mật khẩu cũ và mật khẩu mới không được để trống');
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    return {
      success: true,
      message: 'Đã cập nhật mật khẩu mới thành công',
    };
  }

  async getProfile(userId: string) {
    if (userId === 'admin-virtual-system-id') {
      const virtualAdmin = {
        id: 'admin-virtual-system-id',
        email: process.env.ADMIN_EMAIL || 'admin@gmail.com',
        name: process.env.ADMIN_DEFAULT_NAME || 'Quản Trị Viên Hệ Thống CELRA',
        role: UserRole.admin,
        roleTitle: 'Super Administrator',
        avatar: null,
        phone: '0987654321',
        isTwoFactorEnabled: false,
        createdAt: new Date(),
        memberships: [],
        isSuperAdmin: true,
      };
      return this.enrichUserWithVietnamese(virtualAdmin);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleTitle: true,
        avatar: true,
        phone: true,
        isTwoFactorEnabled: true,
        createdAt: true,
        memberships: {
          include: {
            organization: true,
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị xóa khỏi hệ thống');
    }

    return this.enrichUserWithVietnamese(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    // Chặn tự ý thay đổi email chưa qua xác thực OTP/mật khẩu tại endpoint hồ sơ
    if (dto.email !== undefined && dto.email.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException(
        'Không thể thay đổi email trực tiếp tại hồ sơ cá nhân khi chưa xác thực',
      );
    }

    if (dto.avatar !== undefined && dto.avatar !== null) {
      const trimmedAvatar = dto.avatar.trim();
      if (!this.isSafeAvatarUrl(trimmedAvatar)) {
        throw new BadRequestException(
          'Đường dẫn ảnh đại diện không hợp lệ (chỉ chấp nhận URL HTTPS hoặc ảnh hợp lệ)',
        );
      }
    }

    const targetName = dto.name;
    const targetPhone = dto.phone;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(targetName !== undefined && { name: targetName.trim() }),
        ...(targetPhone !== undefined && { phone: targetPhone.trim() }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar ? dto.avatar.trim() : dto.avatar }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleTitle: true,
        avatar: true,
        phone: true,
        isTwoFactorEnabled: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      message: 'Cập nhật thông tin cá nhân thành công',
      user: this.enrichUserWithVietnamese(updatedUser),
    };
  }

  private async generateToken(user: { id: string; email: string; role: UserRole; name: string }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return this.jwtService.signAsync(payload);
  }

  async sendForgotPasswordOtp(dto: ForgotPasswordSendOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const lastSentAt = this.forgotOtpCooldownStore.get(email);
    if (lastSentAt && Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
      throw new BadRequestException('Vui lòng đợi 60 giây trước khi yêu cầu gửi lại mã OTP');
    }

    const neutralResponse = {
      success: true,
      message:
        'Nếu email tồn tại trong hệ thống, mã xác thực OTP đã được gửi đến hộp thư của bạn',
    };

    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      // Vẫn áp cooldown cho email không tồn tại để không tạo oracle phân biệt tài khoản
      this.forgotOtpCooldownStore.set(email, Date.now());
      return neutralResponse;
    }

    const otpCode = this.generateSecureOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const now = Date.now();
    this.resetPasswordOtpStore.set(email, {
      code: otpCode,
      expiresAt,
      verified: false,
      attempts: 0,
      lastSentAt: now,
    });
    this.forgotOtpCooldownStore.set(email, now);

    let sent = false;
    try {
      sent = await this.emailService.sendResetPasswordOtpEmail(email, user.name || 'Quý khách', otpCode);
    } catch (e: any) {
      this.logger.error(`Lỗi gửi email khôi phục: ${e.message}`);
    }

    if (sent) {
      return neutralResponse;
    }

    if (this.isDebugOtpAllowed()) {
      this.logger.warn(`=======================================================`);
      this.logger.warn(`🔑 [DEV FALLBACK] MÃ OTP KHÔI PHỤC CHO [${email}]: ${otpCode}`);
      this.logger.warn(`=======================================================`);

      return {
        success: true,
        message: 'Mã xác thực OTP đã được tạo (Môi trường Thử nghiệm)',
        debugOtp: otpCode,
      };
    }

    this.resetPasswordOtpStore.delete(email);
    this.forgotOtpCooldownStore.delete(email);
    throw new ServiceUnavailableException(
      'Không thể gửi email xác thực lúc này, vui lòng thử lại sau',
    );
  }

  async verifyForgotPasswordOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const invalidOtpMessage = 'Mã xác thực OTP không hợp lệ hoặc đã hết hạn';
    const storedOtp = this.resetPasswordOtpStore.get(email);
    if (!storedOtp) {
      throw new BadRequestException(invalidOtpMessage);
    }
    if (new Date() > storedOtp.expiresAt) {
      this.resetPasswordOtpStore.delete(email);
      throw new BadRequestException(invalidOtpMessage);
    }
    const inputOtp = String(dto.otp || '').trim();
    if (!this.safeCompare(storedOtp.code, inputOtp)) {
      storedOtp.attempts = (storedOtp.attempts || 0) + 1;
      if (storedOtp.attempts >= OTP_MAX_ATTEMPTS) {
        this.resetPasswordOtpStore.delete(email);
      }
      throw new BadRequestException(invalidOtpMessage);
    }
    storedOtp.verified = true;
    return {
      success: true,
      message: 'Xác thực mã OTP thành công',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const invalidOtpMessage = 'Mã xác thực OTP không hợp lệ hoặc đã hết hạn';
    const storedOtp = this.resetPasswordOtpStore.get(email);
    if (!storedOtp || !storedOtp.verified) {
      throw new BadRequestException('Vui lòng xác thực mã OTP trước khi đặt lại mật khẩu');
    }
    if (new Date() > storedOtp.expiresAt) {
      this.resetPasswordOtpStore.delete(email);
      throw new BadRequestException(invalidOtpMessage);
    }
    const inputOtp = String(dto.otp || '').trim();
    if (!this.safeCompare(storedOtp.code, inputOtp)) {
      storedOtp.attempts = (storedOtp.attempts || 0) + 1;
      if (storedOtp.attempts >= OTP_MAX_ATTEMPTS) {
        this.resetPasswordOtpStore.delete(email);
      }
      throw new BadRequestException(invalidOtpMessage);
    }

    const rawPassword = dto.matKhauMoi || dto.newPassword;
    if (!rawPassword || rawPassword.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new BadRequestException('Tài khoản không tồn tại trong hệ thống');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(rawPassword, saltRounds);

    await this.prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    this.resetPasswordOtpStore.delete(email);

    return {
      success: true,
      message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập với mật khẩu mới',
    };
  }
}
