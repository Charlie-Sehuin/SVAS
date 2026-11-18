import { extraerTextoPdf, MIN_CARACTERES_PDF } from './texto-pdf';

/** PDF mínimo, hecho a mano, con una línea de texto (como el que se descarga de SUNARP). */
function pdfConTexto(texto: string): Buffer {
  const contenido = `BT /F1 12 Tf 50 750 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

describe('extraerTextoPdf', () => {
  it('saca el texto de un PDF digital', async () => {
    const texto = await extraerTextoPdf(
      pdfConTexto('Placa N: ADQ-345 Marca: VOLKSWAGEN Modelo: JETTA Ano Modelo: 2011'),
    );
    expect(texto).toContain('Marca: VOLKSWAGEN');
    expect(texto.length).toBeGreaterThanOrEqual(MIN_CARACTERES_PDF);
  });

  it('un archivo que no es un PDF válido da cadena vacía, no un error', async () => {
    await expect(extraerTextoPdf(Buffer.from('esto no es un pdf'))).resolves.toBe('');
  });
});
