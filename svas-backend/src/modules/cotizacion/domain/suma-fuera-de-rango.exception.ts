import { BadRequestException } from '@nestjs/common';
import type Decimal from 'decimal.js';

/**
 * RN-37: la suma asegurada debe estar dentro del rango de la aseguradora para
 * ese modelo y año. Es un dato de entrada inválido (400), no "no disponible".
 */
export class SumaFueraDeRangoException extends BadRequestException {
  constructor(
    readonly minima: Decimal,
    readonly maxima: Decimal,
    aseguradora?: string,
  ) {
    super(
      `La suma asegurada${aseguradora ? ` de ${aseguradora}` : ''} debe estar entre USD ${minima.toFixed(2)} y USD ${maxima.toFixed(2)}`,
    );
  }
}
