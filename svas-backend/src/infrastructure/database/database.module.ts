import { Global, Module } from '@nestjs/common';
import {
  SUPABASE_SERVICE_CLIENT,
  supabaseServiceClientProvider,
} from './supabase-service-client.provider';
import { SupabaseUserClientFactory } from './supabase-user-client.factory';

@Global()
@Module({
  providers: [supabaseServiceClientProvider, SupabaseUserClientFactory],
  exports: [SUPABASE_SERVICE_CLIENT, SupabaseUserClientFactory],
})
export class DatabaseModule {}
