import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import {
  jwtKeyResolverProvider,
  SupabaseAuthGuard,
} from './guards/supabase-auth.guard';

/**
 * Guards como providers normales (y no solo APP_GUARD) para que un caso de
 * uso pueda invalidar la caché de RolesGuard al cambiar rol o estado.
 */
@Global()
@Module({
  providers: [jwtKeyResolverProvider, SupabaseAuthGuard, RolesGuard],
  exports: [SupabaseAuthGuard, RolesGuard],
})
export class CommonModule {}
