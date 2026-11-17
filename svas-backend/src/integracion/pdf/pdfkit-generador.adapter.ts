import { Injectable } from '@nestjs/common';
import { nombrePropio } from '../../common/utils/nombre-propio';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { LEYENDA_CONTENIDO } from '../../modules/planes/domain/contenido-plan';
import type {
  DatosSimulacionPdf,
  DatosVentasPdf,
  GeneradorPdf,
} from '../../modules/polizas/domain/generador-pdf.port';
import {
  LEYENDA_DEMOSTRACION,
  type CuotaPoliza,
  type DatosPolizaPdf,
} from '../../modules/polizas/domain/poliza';
import {
  CORREDOR_SEGUROSIMPLE,
  LOGO_CORREDOR,
  plantillaDe,
  type Entidad,
  type PlantillaAseguradora,
} from './plantillas-aseguradora';

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
/** Tamaños de letra del cuerpo de la póliza, del normal al más compacto. */
const TAMANOS_CUERPO = [10, 9.5, 9, 8.5];
const CUERPO = new WeakMap<object, number>();
/** Tamaño de letra del cuerpo para este documento (10 si no se fijó otro). */
const cuerpo = (doc: PDFKit.PDFDocument) => CUERPO.get(doc) ?? 10;

// Vive en common/utils (también la usa el correo de la póliza); se reexporta para no romper importaciones.
export { nombrePropio };

/** Ancho de la franja vertical del diseño LATERAL. */
const FRANJA = 16;
const CANAL: Record<DatosPolizaPdf['canalVenta'], string> = {
  AUTONOMO: 'Compra en línea',
  ASESORIA: 'Con asesoría',
  TELEMARKETING: 'Retomada con un asesor',
};
const DESCUENTO: Record<string, string> = {
  PRIMERA_COMPRA: 'primera compra',
  NEGOCIADO: 'negociado',
};

interface Logo {
  datos: Buffer;
  /** Ancho / alto de la imagen. */
  proporcion: number;
}
const LOGOS = new Map<string, Logo | null>();
/** Logo PNG de ./logos (se lee una vez). Si el archivo falta, el PDF sale sin logo. */
function leerLogo(archivo: string): Logo | null {
  if (!LOGOS.has(archivo)) {
    try {
      const datos = readFileSync(join(__dirname, 'logos', archivo));
      // Cabecera PNG: ancho y alto en los bytes 16 y 20.
      const proporcion = datos.readUInt32BE(16) / datos.readUInt32BE(20);
      LOGOS.set(archivo, { datos, proporcion });
    } catch {
      LOGOS.set(archivo, null);
    }
  }
  return LOGOS.get(archivo) ?? null;
}

/** "Razón social · RUC … · domicilio"; el RUC y el domicilio solo si se conocen. */
function entidad(e: Entidad): string {
  return [e.razonSocial, e.ruc && `RUC ${e.ruc}`, e.domicilio]
    .filter(Boolean)
    .join(' · ');
}

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
 * El encabezado y los títulos de la póliza cambian según la aseguradora
 * (plantillas-aseguradora.ts); la simulación y el reporte de ventas no.
 */
@Injectable()
export class PdfkitGeneradorAdapter implements GeneradorPdf {
  /**
   * Intenta que la póliza quepa en 1 página: si con la letra normal se pasa,
   * la vuelve a dibujar con letra algo más chica. Si ni así cabe (plan muy
   * largo), se queda con la letra normal en varias páginas.
   */
  async generarPoliza(d: DatosPolizaPdf): Promise<Buffer> {
    let normal: Buffer | null = null;
    for (const tamano of TAMANOS_CUERPO) {
      let paginas = 0;
      const pdf = await this.documento(
        {
          Title: `Póliza ${d.numeroPoliza} (demostración)`,
          Subject: LEYENDA_DEMOSTRACION,
        },
        LEYENDA_DEMOSTRACION,
        (doc) => {
          CUERPO.set(doc, tamano);
          this.dibujar(doc, d);
        },
        (n) => (paginas = n),
      );
      if (paginas <= 1) return pdf;
      normal ??= pdf;
    }
    return normal!;
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
    alContarPaginas?: (paginas: number) => void,
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
        alContarPaginas?.(doc.bufferedPageRange().count);
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
    const p = plantillaDe(c.aseguradora);

    this.encabezado(doc, p, c.plan);

    // Saludo personalizado con el nombre del titular y su auto.
    const nombre = nombrePropio(d.titular.nombres);
    doc.font('Helvetica-Bold').fontSize(cuerpo(doc)).fillColor(COLOR_TEXTO);
    doc.text(nombre ? `Hola, ${nombre}: ` : 'Hola: ', { continued: true });
    doc
      .font('Helvetica')
      .text(
        `gracias por confiar en SeguroSimple para asegurar tu ${d.vehiculo.marca} ${d.vehiculo.modelo} ${d.vehiculo.anio}.`,
      );
    doc.moveDown(0.5);

    // Logo del corredor a la derecha de los datos generales; el texto no lo pisa.
    const anchoPagina = doc.page.width - 2 * MARGEN;
    const altoCorredor = 30;
    const anchoCorredor = this.anchoLogo(LOGO_CORREDOR, altoCorredor);
    const yDatos = doc.y;
    this.logo(
      doc,
      LOGO_CORREDOR,
      MARGEN + anchoPagina - anchoCorredor,
      yDatos,
      altoCorredor,
    );
    doc.x = MARGEN;
    doc.y = yDatos;
    this.datos(
      doc,
      [
        ['Número de póliza', d.numeroPoliza],
        ['Fecha de emisión', fecha(d.fechaEmision)],
        ['Canal', CANAL[d.canalVenta]],
        ['Aseguradora', entidad(p)],
        ['Corredor', entidad(CORREDOR_SEGUROSIMPLE)],
      ],
      anchoCorredor ? anchoPagina - anchoCorredor - 12 : undefined,
    );

    // Titular y Vehículo van lado a lado para ahorrar alto.
    const u = d.ubicacion;
    const zona: [string, string][] = u
      ? [['Zona de uso', `${u.distrito}, ${u.provincia}, ${u.departamento}`]]
      : [];
    const separacion = 16;
    const mitad = (anchoPagina - separacion) / 2;
    const xDerecha = MARGEN + mitad + separacion;
    const yBloque = doc.y;
    this.titulo(doc, 'Titular', p, MARGEN, mitad);
    this.datos(
      doc,
      [
        ['Nombre', nombrePropio(`${d.titular.nombres} ${d.titular.apellidos}`)],
        ['Documento', d.titular.numeroDocumento ?? '—'],
      ],
      mitad,
    );
    const yTitular = doc.y;
    doc.y = yBloque;
    doc.fontSize(cuerpo(doc));
    this.titulo(doc, 'Vehículo', p, xDerecha, mitad);
    doc.x = xDerecha;
    this.datos(
      doc,
      [
        [
          'Vehículo',
          `${d.vehiculo.marca} ${d.vehiculo.modelo} ${d.vehiculo.anio}`,
        ],
        ['Placa', d.vehiculo.placa ?? '—'],
        ...zona,
        ['Suma asegurada', usd(d.sumaAsegurada)],
      ],
      mitad,
    );
    doc.x = MARGEN;
    doc.y = Math.max(doc.y, yTitular);

    this.titulo(doc, 'Prima y pago', p);
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
        .fontSize(cuerpo(doc) - 1)
        .fillColor(COLOR_SUAVE)
        .text('Cronograma de cuotas');
      this.cronograma(doc, d.pago.cuotas);
    }

    const incluidas = c.coberturas.filter((x) => x.incluida);
    const noIncluidas = c.coberturas.filter((x) => !x.incluida);

    this.titulo(doc, 'Qué cubre', p);
    if (c.resumen)
      doc
        .font('Helvetica-Oblique')
        .fontSize(cuerpo(doc))
        .fillColor(COLOR_TEXTO)
        .text(c.resumen)
        .moveDown(0.3);
    this.listaEnColumnas(
      doc,
      incluidas.map((x) =>
        x.detalle ? `${x.nombre}: ${x.detalle}` : x.nombre,
      ),
    );

    this.titulo(doc, 'Qué no cubre', p);
    this.lista(doc, [
      ...noIncluidas.map((x) => `${x.nombre} (no incluida en este plan)`),
      ...c.exclusiones,
    ]);

    this.titulo(doc, 'Requisitos', p);
    this.lista(
      doc,
      c.requisitos.map((r) =>
        r.obligatorio ? r.texto : `${r.texto} (opcional)`,
      ),
    );

    doc.moveDown(0.6);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLOR_SUAVE)
      .text(
        `Contenido del plan tal como estaba al comprar (${fecha(c.congeladoEn)}). ${LEYENDA_CONTENIDO}`,
      );

    if (p.diseno === 'LATERAL') {
      // La franja va en todas las páginas, también en las que se agregaron solas.
      const { start, count } = doc.bufferedPageRange();
      for (let i = start; i < start + count; i++) {
        doc.switchToPage(i);
        doc.rect(0, 0, FRANJA, doc.page.height).fill(p.color);
      }
    }
  }

  /** Dibuja el logo con el alto dado y devuelve el ancho que ocupó (0 si no hay logo). */
  private logo(
    doc: PDFKit.PDFDocument,
    archivo: string | null,
    x: number,
    y: number,
    alto: number,
  ): number {
    const logo = archivo ? leerLogo(archivo) : null;
    if (!logo) return 0;
    doc.image(logo.datos, x, y, { height: alto });
    return alto * logo.proporcion;
  }

  /** Ancho que ocupará un logo con el alto dado, sin dibujarlo (0 si no hay logo). */
  private anchoLogo(archivo: string | null, alto: number): number {
    const logo = archivo ? leerLogo(archivo) : null;
    return logo ? alto * logo.proporcion : 0;
  }

  /** Encabezado de la póliza: uno por diseño, con el logo si existe. Deja el cursor listo para los datos. */
  private encabezado(
    doc: PDFKit.PDFDocument,
    p: PlantillaAseguradora,
    plan: string,
  ) {
    const ancho = doc.page.width - 2 * MARGEN;
    const documento = 'Póliza de seguro vehicular';
    const subtitulo = `${documento} · Plan ${plan}`;
    const leyenda = () =>
      doc
        .fillColor(COLOR_AVISO)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(LEYENDA_DEMOSTRACION.toUpperCase(), MARGEN, doc.y, {
          align: 'center',
          width: ancho,
        });
    /** Nombre (en negrita, ajustado al ancho) y debajo el subtítulo, centrados en vertical en `alto`. */
    const textos = (
      x: number,
      y: number,
      anchoTexto: number,
      alto: number,
      max: number,
      colorNombre: string,
      colorSub: string,
      align: 'left' | 'center' = 'left',
    ) => {
      const opciones = { width: anchoTexto, align } as const;
      this.ajustar(doc, p.razonSocial, anchoTexto, max);
      const altoNombre = doc.heightOfString(p.razonSocial, opciones);
      const yTexto = y + Math.max(0, (alto - altoNombre - 14) / 2);
      doc.fillColor(colorNombre).text(p.razonSocial, x, yTexto, opciones);
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(colorSub)
        .text(subtitulo, x, doc.y, opciones);
      return doc.y;
    };

    switch (p.diseno) {
      case 'BANDA': {
        const altoBanda = 78;
        doc.rect(0, 0, doc.page.width, altoBanda).fill(p.color);
        const w = this.logo(doc, p.logo, MARGEN, 14, 50);
        const x = MARGEN + (w ? w + 16 : 0);
        textos(x, 14, ancho - (x - MARGEN), 50, 20, '#ffffff', '#ffffff');
        doc.y = altoBanda + 12;
        leyenda();
        break;
      }
      case 'LATERAL': {
        leyenda();
        doc.moveDown(0.8);
        const y = doc.y;
        const altoLogo = 50;
        const w = this.logo(doc, p.logo, MARGEN, y, altoLogo);
        const x = MARGEN + (w ? w + 14 : 0);
        const fin = textos(
          x,
          y,
          ancho - (x - MARGEN),
          w ? altoLogo : 0,
          18,
          p.color,
          COLOR_SUAVE,
        );
        doc.y = Math.max(fin, w ? y + altoLogo + 2 : 0);
        break;
      }
      case 'DOBLE_LINEA': {
        leyenda();
        doc.moveDown(0.6);
        const y = doc.y;
        doc.strokeColor(p.color);
        doc
          .lineWidth(3)
          .moveTo(MARGEN, y)
          .lineTo(MARGEN + ancho, y)
          .stroke();
        doc
          .lineWidth(1)
          .moveTo(MARGEN, y + 5)
          .lineTo(MARGEN + ancho, y + 5)
          .stroke();
        const altoLogo = 46;
        const w = this.logo(doc, p.logo, MARGEN, y + 12, altoLogo);
        // El nombre va centrado en la página: deja libre el ancho del logo a ambos lados.
        const hueco = w ? w + 12 : 0;
        const fin = textos(
          MARGEN + hueco,
          y + 12,
          ancho - 2 * hueco,
          w ? altoLogo : 0,
          18,
          p.color,
          COLOR_SUAVE,
          'center',
        );
        doc.y = Math.max(fin, w ? y + 12 + altoLogo + 2 : 0);
        break;
      }
      case 'BLOQUE': {
        leyenda();
        doc.moveDown(0.6);
        const y = doc.y;
        const relleno = 7;
        const altoLogo = 40;
        const anchoDerecha = 132;
        const w = this.anchoLogo(p.logo, altoLogo);
        const xNombre = MARGEN + relleno + (w ? w + 10 : 0);
        const xDerecha = MARGEN + ancho - relleno - anchoDerecha;
        const anchoNombre = xDerecha - 10 - xNombre;
        this.ajustar(doc, p.razonSocial, anchoNombre, 18);
        const altoNombre = doc.heightOfString(p.razonSocial, {
          width: anchoNombre,
        });
        const alto = Math.max(altoNombre, w ? altoLogo : 28) + 2 * relleno;
        doc.rect(MARGEN, y, ancho, alto).fill(p.color);
        this.logo(
          doc,
          p.logo,
          MARGEN + relleno,
          y + (alto - altoLogo) / 2,
          altoLogo,
        );
        doc
          .font('Helvetica-Bold')
          .fillColor('#ffffff')
          .text(p.razonSocial, xNombre, y + (alto - altoNombre) / 2, {
            width: anchoNombre,
          });
        const derecha = { width: anchoDerecha, align: 'right' } as const;
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text(documento, xDerecha, y + alto / 2 - 13, derecha);
        doc
          .font('Helvetica')
          .text(`Plan ${plan}`, xDerecha, doc.y + 1, derecha);
        doc.y = y + alto + 4;
        break;
      }
      case 'MINIMAL': {
        leyenda();
        doc.moveDown(0.8);
        const y0 = doc.y;
        const altoLogo = 46;
        const w = this.logo(doc, p.logo, MARGEN, y0, altoLogo);
        const x = MARGEN + (w ? w + 14 : 0);
        const anchoTexto = ancho - (x - MARGEN);
        this.ajustar(doc, p.razonSocial, anchoTexto, 22);
        const altoNombre = doc.heightOfString(p.razonSocial, {
          width: anchoTexto,
        });
        doc
          .fillColor(p.color)
          .text(
            p.razonSocial,
            x,
            y0 + Math.max(0, (w ? altoLogo : 0) - altoNombre - 16) / 2,
            { width: anchoTexto },
          );
        const y = doc.y + 1;
        doc
          .lineWidth(1.5)
          .strokeColor(p.color)
          .moveTo(x, y)
          .lineTo(MARGEN + ancho, y)
          .stroke();
        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor(COLOR_SUAVE)
          .text(subtitulo, x, y + 5, { width: anchoTexto });
        doc.y = Math.max(doc.y, w ? y0 + altoLogo + 2 : 0);
        break;
      }
    }
    doc.lineWidth(1);
    doc.x = MARGEN;
    doc.font('Helvetica').fontSize(11).moveDown(0.6);
  }

  /** Deja puesta la negrita con el mayor tamaño (desde `max`) con que el texto cabe en una línea. */
  private ajustar(
    doc: PDFKit.PDFDocument,
    texto: string,
    ancho: number,
    max: number,
    min = 11,
  ) {
    doc.font('Helvetica-Bold');
    let tamano = max;
    while (tamano > min && doc.fontSize(tamano).widthOfString(texto) > ancho)
      tamano -= 0.5;
    doc.fontSize(tamano);
  }

  /** Cuotas en dos columnas (primero baja la izquierda): 12 cuotas ocupan 6 renglones. */
  private cronograma(doc: PDFKit.PDFDocument, cuotas: CuotaPoliza[]) {
    doc
      .font('Helvetica')
      .fontSize(cuerpo(doc) - 1)
      .fillColor(COLOR_TEXTO);
    const columna = (doc.page.width - 2 * MARGEN) / 2;
    const renglon = doc.currentLineHeight(true);
    const filas = Math.ceil(cuotas.length / 2);
    if (doc.y + filas * renglon > doc.page.height - doc.page.margins.bottom)
      doc.addPage();
    const y = doc.y;
    cuotas.forEach((q, i) => {
      doc.text(
        `Cuota ${q.numero}  ·  vence ${fecha(q.fechaVencimiento)}  ·  ${usd(q.monto)}${q.estado === 'CONFIRMADO' ? '  ·  pagada' : ''}`,
        MARGEN + (i < filas ? 0 : columna),
        y + (i % filas) * renglon,
        { width: columna - 8, lineBreak: false },
      );
    });
    doc.x = MARGEN;
    doc.y = y + filas * renglon;
  }

  /** Título de sección. Con plantilla (solo la póliza) toma el estilo y color de la aseguradora; `x` y `anchoTitulo` permiten ponerlo en media página. */
  private titulo(
    doc: PDFKit.PDFDocument,
    texto: string,
    p?: PlantillaAseguradora,
    x = MARGEN,
    anchoTitulo?: number,
  ) {
    doc.moveDown(p ? 0.6 : 0.8);
    if (!p) {
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(COLOR_TEXTO)
        .text(texto);
      doc.moveDown(0.2);
      return;
    }
    // Que el título no quede solo al final de la página.
    if (doc.y + 34 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    const ancho = anchoTitulo ?? doc.page.width - 2 * MARGEN;
    doc.font('Helvetica-Bold').fontSize(12);
    switch (p.diseno) {
      case 'BANDA':
        doc.rect(x, y - 3, ancho, 17).fill(p.colorSuave);
        doc.fillColor(p.color).text(texto, x + 6, y);
        break;
      case 'LATERAL':
        doc.rect(x, y - 2, 3, 14).fill(p.color);
        doc.fillColor(COLOR_TEXTO).text(texto, x + 9, y);
        break;
      case 'DOBLE_LINEA':
        doc.fillColor(p.color).text(texto, x, y);
        doc
          .lineWidth(0.75)
          .strokeColor(p.color)
          .moveTo(x, doc.y)
          .lineTo(x + ancho, doc.y)
          .stroke()
          .lineWidth(1);
        break;
      case 'BLOQUE':
        doc.rect(x, y - 3, doc.widthOfString(texto) + 16, 17).fill(p.color);
        doc.fillColor('#ffffff').text(texto, x + 8, y);
        break;
      case 'MINIMAL':
        doc.fillColor(p.color).text(texto, x, y);
        break;
    }
    doc.x = x;
    doc.moveDown(0.3);
  }

  /** Con `ancho`, el texto se parte antes de llegar al borde derecho (para no pisar un logo). */
  private datos(
    doc: PDFKit.PDFDocument,
    filas: [string, string][],
    ancho?: number,
  ) {
    doc.fontSize(cuerpo(doc));
    const limite = ancho ? { width: ancho } : {};
    for (const [etiqueta, valor] of filas) {
      doc
        .font('Helvetica-Bold')
        .fillColor(COLOR_SUAVE)
        .text(`${etiqueta}: `, { ...limite, continued: true });
      doc.font('Helvetica').fillColor(COLOR_TEXTO).text(valor, limite);
    }
  }

  private lista(doc: PDFKit.PDFDocument, items: string[]) {
    doc.font('Helvetica').fontSize(cuerpo(doc)).fillColor(COLOR_TEXTO);
    if (items.length === 0) {
      doc.text('—');
      return;
    }
    for (const item of items) doc.text(`•  ${item}`, { indent: 8 });
  }

  /**
   * Lista en dos columnas (primero baja la izquierda) para ahorrar alto.
   * Si es corta o no cabe entera en lo que queda de página, va en una columna,
   * que sí puede seguir en la página siguiente.
   */
  private listaEnColumnas(doc: PDFKit.PDFDocument, items: string[]) {
    doc.font('Helvetica').fontSize(cuerpo(doc)).fillColor(COLOR_TEXTO);
    const separacion = 16;
    const sangria = 8;
    const vineta = 11;
    const ancho = (doc.page.width - 2 * MARGEN - separacion) / 2;
    const opciones = { width: ancho - sangria - vineta };
    const altos = items.map((item) => doc.heightOfString(item, opciones));
    const suma = (desde: number, hasta: number) =>
      altos.slice(desde, hasta).reduce((a, b) => a + b, 0);
    // Corte que deja las dos columnas lo más parejas posible en alto.
    let mitad = 1;
    let altoTotal = Infinity;
    for (let i = 1; i < items.length; i++) {
      const alto = Math.max(suma(0, i), suma(i, items.length));
      if (alto < altoTotal) {
        altoTotal = alto;
        mitad = i;
      }
    }
    const columnas = [items.slice(0, mitad), items.slice(mitad)];
    const fin = doc.page.height - doc.page.margins.bottom;
    if (items.length < 6 || doc.y + altoTotal > fin) {
      this.lista(doc, items);
      return;
    }
    const y0 = doc.y;
    columnas.forEach((columna, i) => {
      const x = MARGEN + i * (ancho + separacion) + sangria;
      let y = y0;
      for (const item of columna) {
        doc.text('•', x, y, { lineBreak: false });
        doc.text(item, x + vineta, y, opciones);
        y = doc.y;
      }
    });
    doc.x = MARGEN;
    doc.y = y0 + altoTotal;
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
