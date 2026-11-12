import { IsIn, IsOptional, Matches } from 'class-validator';
import {
  AGRUPAR_VENTAS,
  type AgruparVentas,
  FORMATO_FECHA,
} from '../../domain/reportes';

const FECHA = { message: 'Las fechas deben tener el formato AAAA-MM-DD' };

/** ?desde=&hasta= (días de Lima). Sin fechas: el mes en curso. */
export class PeriodoQueryDto {
  @IsOptional()
  @Matches(FORMATO_FECHA, FECHA)
  desde?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, FECHA)
  hasta?: string;
}

/** GET /admin/reportes/ventas?desde=&hasta=&agrupar=canal|aseguradora|plan */
export class VentasQueryDto extends PeriodoQueryDto {
  @IsOptional()
  @IsIn(AGRUPAR_VENTAS, { message: 'Agrupa por canal, aseguradora o plan' })
  agrupar?: AgruparVentas;
}
