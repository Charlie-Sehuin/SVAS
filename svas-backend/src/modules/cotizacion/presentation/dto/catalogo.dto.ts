import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ProvinciasQuery {
  @Transform(recortar)
  @IsString({ message: 'Indica el departamento' })
  @MinLength(2, { message: 'Indica el departamento' })
  @MaxLength(40, { message: 'El departamento no es válido' })
  departamento!: string;
}

export class DistritosQuery extends ProvinciasQuery {
  @Transform(recortar)
  @IsString({ message: 'Indica la provincia' })
  @MinLength(2, { message: 'Indica la provincia' })
  @MaxLength(40, { message: 'La provincia no es válida' })
  provincia!: string;
}
