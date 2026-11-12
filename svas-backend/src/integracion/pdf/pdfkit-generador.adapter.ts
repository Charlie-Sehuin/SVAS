import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { LEYENDA_CONTENIDO } from '../../modules/planes/domain/contenido-plan';
import type {
  DatosSimulacionPdf,
  DatosVentasPdf,
  GeneradorPdf,
} from '../../modules/polizas/domain/generador-pdf.port';
import {
  LEYENDA_DEMOSTRACION,
  type DatosPolizaPdf,
} from '../../modules/polizas/domain/poliza';

const ZONA = 'America/Lima';
const MARGEN = 50;
const ZONAS: Record<string, string> = {
  ALTA: 'alta',
  MEDIA: 'media',
  BAJA: 'baja',
};
const AGRUPAR: Record<string, string> = {
  canal: 'Canal',
  aseguradora: 'Aseguradora',
  plan: 'Plan',
};
const COLOR_TEXTO = '#1f2933';
const COLOR_SUAVE = '#52606d';
const COLOR_AVISO = '#b42318';
const CANAL: Record<DatosPolizaPdf['canalVenta'], string> = {
  AUTONOMO: 'Compra en línea',
  ASESORIA: 'Con asesoría',
  TELEMARKETING: 'Retomada con un asesor',
};
const DESCUENTO: Record<string, string> = {
  PRIMERA_COMPRA: 'primera compra',
  NEGOCIADO: 'negociado',
};

/** 1234.5 → "USD 1,234.50" (el monto llega como string con 2 decimales). */
export function usd(monto: string): string {
  const [entero, dec = '00'] = monto.split('.');
  return `USD ${entero!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec.padEnd(2, '0')}`;
}

/** Fecha y hora → "12/11/2026" en hora de Lima; una fecha YYYY-MM-DD se muestra tal cual. */
export function fecha(valor: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-');
    return `${d}/${m}/${a}`;
  }
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: ZONA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(valor));
}

/**
 * Póliza de demostración en A4 con PDFKit (fuente Helvetica: cubre tildes y ñ).
 * Todo sale de los datos recibidos (copia del plan al comprar, RN-45); no
 * consulta nada. La leyenda RNF-20 va arriba y en el pie de cada página.
 */
@Injectable()
export class PdfkitGeneradorAdapter implements GeneradorPdf {
  generarPoliza(d: DatosPolizaPdf): Promise<Buffer> {
    return this.documento(
      {
        Title: `Póliza ${d.numeroPoliza} (demostración)`,
        Subject: LEYENDA_DEMOSTRACION,
      },
      LEYENDA_DEMOSTRACION,
      (doc) => this.dibujar(doc, d),
    );
  }

  /** Resumen de 1 página de la Prueba de Choque; sin datos del perfil (RN-36). */
  generarSimulacion(d: DatosSimulacionPdf): Promise<Buffer> {
    return this.documento(
      { Title: 'Prueba de Choque · resumen', Subject: d.leyenda },
      d.leyenda,
      (doc) => {
        doc.fillColor(COLOR_TEXTO).font('Helvetica-Bold').fontSize(18);
        doc.text('Prueba de Choque: tu resumen');
        doc.font('Helvetica').fontSize(10).fillColor(COLOR_SUAVE);
        doc.text(
          `Simulación del ${fecha(d.fecha)} · zona de riesgo ${ZONAS[d.zona] ?? d.zona}`,
        );
        if (!d.vigente) {
          doc.moveDown(0.3).fillColor(COLOR_AVISO);
          doc.text(
            'Cambiaste la suma asegurada después de simular: estos montos pueden estar desactualizados.',
          );
        }
        doc.moveDown(0.8);
        doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO);
        doc.text(
          'Costo real anual = prima + lo que pagarías de tu bolsillo, en promedio, por los siniestros más probables. ' +
            'De menor a mayor:',
        );
        doc.moveDown(0.5);
        this.tabla(
          doc,
          ['#', 'Plan', 'Prima', 'De tu bolsillo', 'Costo real', 'Peor caso'],
          [22, 165, 75, 85, 79, 69],
          d.ranking.map((r) => [
            String(r.posicion),
            `${r.aseguradora} · ${r.plan}${r.datosCompletos ? '' : ' *'}`,
            usd(r.prima),
            usd(r.desembolsoEsperado),
            usd(r.costoRealAnual),
            usd(r.peorCaso),
          ]),
          2,
        );
        if (d.ranking.some((r) => !r.datosCompletos)) {
          doc
            .moveDown(0.3)
            .font('Helvetica')
            .fontSize(8)
            .fillColor(COLOR_SUAVE);
          doc.text(
            '* Sin información completa de coberturas para algún escenario.',
          );
        }
        if (d.contraste) {
          this.titulo(doc, 'El dato que más cambia');
          doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO);
          doc.text(d.contraste);
        }
      },
    );
  }

  /** Reporte de ventas del periodo (RF-30). */
  generarReporteVentas(d: DatosVentasPdf): Promise<Buffer> {
    const pie = `Reporte interno de SeguroSimple · generado el ${fecha(d.generadoEn)}`;
    const grupo = AGRUPAR[d.agrupar] ?? 'Grupo';
    return this.documento(
      { Title: `Ventas del ${d.desde} al ${d.hasta}`, Subject: pie },
      pie,
      (doc) => {
        doc.fillColor(COLOR_TEXTO).font('Helvetica-Bold').fontSize(18);
        doc.text('Reporte de ventas');
        doc.font('Helvetica').fontSize(10).fillColor(COLOR_SUAVE);
        doc.text(
          `Del ${fecha(d.desde)} al ${fecha(d.hasta)} · por ${grupo.toLowerCase()}`,
        );
        this.titulo(doc, 'Totales');
        const t = d.totales;
        this.datos(doc, [
          ['Pólizas emitidas', `${t.polizas} (${t.enCuotas} en cuotas)`],
          ['Prima anual', usd(t.primaAnual)],
          ['Descuentos', usd(t.descuentos)],
          ['Prima final', usd(t.primaFinal)],
          ['Cobrado (incluye recargos por cuotas)', usd(t.cobrado)],
          ['Ticket promedio', t.ticketPromedio ? usd(t.ticketPromedio) : '—'],
        ]);
        this.titulo(doc, 'Detalle');
        if (d.grupos.length === 0) {
          doc.font('Helvetica').fontSize(10).text('Sin ventas en el periodo.');
          return;
        }
        this.tabla(
          doc,
          [grupo, 'Pólizas', 'Prima final', 'Cobrado', 'Ticket', 'Part.'],
          [165, 50, 85, 85, 70, 40],
          d.grupos.map((g) => [
            g.etiqueta,
            String(g.polizas),
            usd(g.primaFinal),
            usd(g.cobrado),
            usd(g.ticketPromedio),
            g.participacion ? `${g.participacion} %` : '—',
          ]),
          1,
        );
      },
    );
  }

  /** A4, Helvetica (cubre tildes y ñ), con la leyenda dada en el pie de cada página. */
  private documento(
    info: { Title: string; Subject: string },
    pie: string,
    dibujar: (doc: PDFKit.PDFDocument) => void,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 60, left: MARGEN, right: MARGEN },
        bufferPages: true,
        info: { ...info, Author: 'SeguroSimple' },
      });
      const partes: Buffer[] = [];
      doc.on('data', (b: Buffer) => partes.push(b));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);

      try {
        dibujar(doc);
        this.pieDePagina(doc, pie);
        doc.end();
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  /** Tabla simple: encabezado en gris; las primeras `columnasTexto` a la izquierda, el resto (números) a la derecha. */
  private tabla(
    doc: PDFKit.PDFDocument,
    encabezado: string[],
    anchos: number[],
    filas: string[][],
    columnasTexto: number,
  ) {
    const fila = (celdas: string[], negrita: boolean) => {
      const y = doc.y;
      let x = MARGEN;
      let alto = 0;
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      doc.fillColor(negrita ? COLOR_SUAVE : COLOR_TEXTO);
      celdas.forEach((c, i) => {
        const opciones = {
          width: anchos[i]! - 6,
          align: i < columnasTexto ? 'left' : 'right',
        } as const;
        doc.text(c, x, y, opciones);
        alto = Math.max(alto, doc.heightOfString(c, opciones));
        x += anchos[i]!;
      });
      doc.x = MARGEN;
      doc.y = y + alto + 4;
    };
    fila(encabezado, true);
    const ancho = anchos.reduce((a, b) => a + b, 0);
    doc
      .moveTo(MARGEN, doc.y - 2)
      .lineTo(MARGEN + ancho, doc.y - 2)
      .strokeColor('#cbd2d9')
      .stroke();
    for (const f of filas) fila(f, false);
  }

  private dibujar(doc: PDFKit.PDFDocument, d: DatosPolizaPdf) {
    const c = d.contenidoPlan;

    doc
      .fillColor(COLOR_AVISO)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(LEYENDA_DEMOSTRACION.toUpperCase(), { align: 'center' });
    doc.moveDown(0.8);
    doc.fillColor(COLOR_TEXTO).fontSize(18).text('Póliza de seguro vehicular');
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(COLOR_SUAVE)
      .text(`${c.aseguradora} · Plan ${c.plan}`);
    doc.moveDown(0.6);

    this.datos(doc, [
      ['Número de póliza', d.numeroPoliza],
      ['Fecha de emisión', fecha(d.fechaEmision)],
      ['Canal', CANAL[d.canalVenta]],
    ]);

    this.titulo(doc, 'Titular');
    this.datos(doc, [
      ['Nombre', `${d.titular.nombres} ${d.titular.apellidos}`],
      ['Documento', d.titular.numeroDocumento ?? '—'],
    ]);

    this.titulo(doc, 'Vehículo');
    this.datos(doc, [
      [
        'Vehículo',
        `${d.vehiculo.marca} ${d.vehiculo.modelo} ${d.vehiculo.anio}`,
      ],
      ['Placa', d.vehiculo.placa ?? '—'],
      ['Suma asegurada', usd(d.sumaAsegurada)],
    ]);

    this.titulo(doc, 'Prima y pago');
    const filas: [string, string][] = [['Prima anual', usd(d.primaAnual)]];
    if (d.descuento) {
      filas.push([
        `Descuento (${DESCUENTO[d.descuento.tipo] ?? d.descuento.tipo})`,
        `${d.descuento.porcentaje} %`,
      ]);
    }
    filas.push(['Prima final', usd(d.primaFinal)]);
    filas.push([
      'Forma de pago',
      d.pago.modo === 'UNICO'
        ? 'Al contado'
        : `${d.pago.numeroCuotas} cuotas mensuales`,
    ]);
    filas.push(['Total pagado / a pagar', usd(d.pago.montoTotal)]);
    this.datos(doc, filas);

    if (d.pago.cuotas.length > 0) {
      doc.moveDown(0.3);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLOR_SUAVE)
        .text('Cronograma de cuotas');
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXTO);
      for (const q of d.pago.cuotas) {
        doc.text(
          `Cuota ${q.numero}  ·  vence ${fecha(q.fechaVencimiento)}  ·  ${usd(q.monto)}${q.estado === 'CONFIRMADO' ? '  ·  pagada' : ''}`,
        );
      }
    }

    const incluidas = c.coberturas.filter((x) => x.incluida);
    const noIncluidas = c.coberturas.filter((x) => !x.incluida);

    this.titulo(doc, 'Qué cubre');
    if (c.resumen)
      doc.font('Helvetica-Oblique').fontSize(10).text(c.resumen).moveDown(0.3);
    this.lista(
      doc,
      incluidas.map((x) =>
        x.detalle ? `${x.nombre}: ${x.detalle}` : x.nombre,
      ),
    );

    this.titulo(doc, 'Qué no cubre');
    this.lista(doc, [
      ...noIncluidas.map((x) => `${x.nombre} (no incluida en este plan)`),
      ...c.exclusiones,
    ]);

    this.titulo(doc, 'Requisitos');
    this.lista(
      doc,
      c.requisitos.map((r) =>
        r.obligatorio ? r.texto : `${r.texto} (opcional)`,
      ),
    );

    doc.moveDown(1);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLOR_SUAVE)
      .text(
        `Contenido del plan tal como estaba al comprar (${fecha(c.congeladoEn)}). ${LEYENDA_CONTENIDO}`,
      );
  }

  private titulo(doc: PDFKit.PDFDocument, texto: string) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_TEXTO).text(texto);
    doc.moveDown(0.2);
  }

  private datos(doc: PDFKit.PDFDocument, filas: [string, string][]) {
    doc.fontSize(10);
    for (const [etiqueta, valor] of filas) {
      doc
        .font('Helvetica-Bold')
        .fillColor(COLOR_SUAVE)
        .text(`${etiqueta}: `, { continued: true });
      doc.font('Helvetica').fillColor(COLOR_TEXTO).text(valor);
    }
  }

  private lista(doc: PDFKit.PDFDocument, items: string[]) {
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO);
    if (items.length === 0) {
      doc.text('—');
      return;
    }
    for (const item of items) doc.text(`•  ${item}`, { indent: 8 });
  }

  /** Leyenda (RNF-20 en la póliza) y número de página en el pie de todas las páginas. */
  private pieDePagina(doc: PDFKit.PDFDocument, leyenda: string) {
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      const abajo = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLOR_AVISO)
        .text(
          `${leyenda} · Página ${i - start + 1} de ${count}`,
          doc.page.margins.left,
          doc.page.height - 35,
          {
            align: 'center',
            width:
              doc.page.width - doc.page.margins.left - doc.page.margins.right,
          },
        );
      doc.page.margins.bottom = abajo;
    }
  }
}
