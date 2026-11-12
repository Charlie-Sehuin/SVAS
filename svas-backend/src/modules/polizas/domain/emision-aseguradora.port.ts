/** Puerto 3/6 · Emisión de la póliza en la aseguradora (arquitectura backend §4.5). */
export interface EmisionAseguradora {
  emitir(i: {
    codigoEstrategia: string;
    ordenId: string;
  }): Promise<{ numeroPoliza: string }>;
}

export const EMISION_ASEGURADORA = Symbol('EMISION_ASEGURADORA');
