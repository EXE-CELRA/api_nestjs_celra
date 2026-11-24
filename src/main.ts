import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

const DEV_LAN_ORIGIN_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

export function buildAllowedCorsOrigins(): string[] {
  const envRaw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (envRaw) {
    return envRaw
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === 'production') {
    return ['https://web-react-celra.vercel.app'];
  }
  return [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];
}

export function configureApp(app: NestExpressApplication): void {
  const isProd = process.env.NODE_ENV === 'production';

  // Tin cậy đúng 1 lớp Reverse Proxy (Render/Nginx) để Express tính req.ip chính xác
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security Headers tích hợp sẵn của NestJS v12 (tương đương Helmet 8, 0 external deps)
  app.useSecurityHeaders({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: isProd ? true : false,
  });

  // Giới hạn kích thước Request Body chống tấn công DoS cạn bộ nhớ
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });

  // Siết chặt CORS theo Whitelist (từ chối bằng callback(null, false) để không sinh 500 giả)
  const allowedOrigins = buildAllowedCorsOrigins();
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.trim().replace(/\/+$/, '');
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      if (!isProd && DEV_LAN_ORIGIN_REGEX.test(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Prefix toàn bộ API
  app.setGlobalPrefix('api/v1');

  // Ẩn Swagger trên Production (trừ khi bật rõ ENABLE_SWAGGER=true)
  if (!isProd || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('CELRA Compliance Platform API')
      .setDescription('Tài liệu API Nền tảng Quản trị & Phối hợp Tuân thủ CELRA')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  configureApp(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Server Backend CELRA đang chạy tại: http://localhost:${port}/api/v1`);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    logger.log(`Tài liệu Swagger API tại: http://localhost:${port}/api/docs`);
  }
}

if (require.main === module) {
  void bootstrap();
}
