import { Global, Module } from '@nestjs/common';
import {
  SUPABASE_SERVICE_CLIENT,
  supabaseServiceClientProvider,
} from './supabase-service-client.provider';

@Global()
@Module({
  providers: [supabaseServiceClientProvider],
  exports: [SUPABASE_SERVICE_CLIENT],
})
export class DatabaseModule {}
