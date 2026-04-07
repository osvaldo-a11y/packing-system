import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (process.env.SWAGGER_DISABLED !== 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Packing System API')
      .setDescription(
        'Documentación interactiva. Usa **Authorize** (candado), pega el `access_token` del login, y prueba los endpoints protegidos.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', in: 'header' },
        'JWT-auth',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'Packing System API',
    });
  }

  const port = Number(process.env.PORT) || 3000;
  // Railway/containers: escuchar en todas las interfaces (no solo localhost).
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err) => {
  console.error('Nest bootstrap failed:', err);
  process.exit(1);
});
