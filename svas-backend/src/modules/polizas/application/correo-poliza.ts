import { nombrePropio } from '../../../common/utils/nombre-propio';
import { LEYENDA_DEMOSTRACION, type DatosPolizaPdf } from '../domain/poliza';

const escaparHtml = (t: string) =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Los correos de los datos de demostración (generados para mostrar reportes) no reciben nada. */
const DOMINIO_DEMOSTRACION = '@demo.svas.pe';
export const esCorreoDeDemostracion = (correo: string) =>
  correo.trim().toLowerCase().endsWith(DOMINIO_DEMOSTRACION);

/** Asunto y texto del correo que acompaña al PDF de la póliza. */
export function armarCorreoPoliza(d: DatosPolizaPdf): {
  asunto: string;
  texto: string;
  html: string;
} {
  const nombre = nombrePropio(d.titular.nombres);
  const auto =
    `${d.vehiculo.marca} ${d.vehiculo.modelo} ${d.vehiculo.anio}`.trim();
  const { aseguradora, plan } = d.contenidoPlan;
  const asunto = `Tu póliza ${d.numeroPoliza} de ${aseguradora}`;

  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';
  const lineas = [
    `gracias por confiar en SeguroSimple. Adjuntamos en PDF tu póliza ${d.numeroPoliza} (${aseguradora}, plan ${plan}) para tu ${auto}.`,
    'También puedes descargarla cuando quieras desde "Mis pólizas", en tu cuenta.',
    `${LEYENDA_DEMOSTRACION}.`,
  ];
  const texto = [`${saludo} ${lineas[0]}`, '', lineas[1], '', lineas[2]].join(
    '\n',
  );
  const html =
    `<p><strong>${escaparHtml(saludo)}</strong> ${escaparHtml(lineas[0]!)}</p>` +
    `<p>${escaparHtml(lineas[1]!)}</p>` +
    `<p style="color:#b42318"><strong>${escaparHtml(lineas[2]!)}</strong></p>`;
  return { asunto, texto, html };
}
