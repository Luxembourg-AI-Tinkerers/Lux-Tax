import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { resolveTrustProxy } from './config/proxy-trust';

/**
 * Uploads arrive as base64 inside the JSON body. The decoded content is capped at
 * `MAX_UPLOAD_BYTES` = 10 MiB (see modules/documents/upload-guard.ts), and base64
 * costs 4/3 of the raw size, so the largest legitimate body is ~13.34 MiB of
 * base64 plus the remaining JSON fields. 15 MiB admits that and nothing more: a
 * bigger body is rejected by Fastify's parser before any handler or service runs,
 * which is what keeps an oversized upload from becoming a memory spike.
 */
const REQUEST_BODY_LIMIT_BYTES = 15 * 1024 * 1024;

/**
 * Helmet 8 dropped its Permissions-Policy middleware, so the header is set here.
 * None of these features are used by an API that only speaks JSON; the camera
 * scanner runs on the web app's own origin, not on this one.
 */
const PERMISSIONS_POLICY =
  'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const fastifyAdapter = new FastifyAdapter({
    logger: process.env.NODE_ENV === 'development',
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    // L6: only consult X-Forwarded-For when the deployment says a proxy is in
    // front of the API. Off by default: the header is client-controlled, and
    // both the audit trail and the per-IP rate-limit bucket key on the address
    // it carries.
    trustProxy: resolveTrustProxy(process.env.TRUST_PROXY),
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);

  // The API returns JSON and nothing else, so the CSP is a lockdown rather than a
  // policy: no scripts, no styles, no frames. `default-src 'none'` covers every
  // fetch directive; frame-ancestors/base-uri/form-action are not covered by it.
  // HSTS is sent unconditionally — browsers ignore it on plain HTTP — so a
  // production deployment behind TLS does not depend on an extra flag being set.
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
    strictTransportSecurity: {
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: false, // preload is a one-way commitment; opt in at the edge instead
    },
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    // The API is meant to be read by the web app on another origin (CORS above is
    // pinned to FRONTEND_URL), so CORP must not be `same-origin`.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (_request, reply) => {
      reply.header('Permissions-Policy', PERMISSIONS_POLICY);
    });

  // The adapter's default preflight answers `GET,HEAD,POST` only, which made
  // every PUT / PATCH / DELETE from the browser fail as "Failed to fetch":
  // saving the questionnaire, editing or deleting a fact, changing a document's
  // visibility and saving a freelance profile were all blocked client-side.
  // Server-to-server clients (and the e2e suite, which uses app.inject) never
  // send a preflight, so nothing caught this until the UI ran in a browser.
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    maxAge: 600,
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`Luxembourg Tax API service listening on port ${port}`);
}

bootstrap();
