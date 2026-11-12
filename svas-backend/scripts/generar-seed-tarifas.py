"""
Genera supabase/migrations/0017_seed_vehiculos_tarifas.sql desde el Excel de
trabajo (contexto §17.10). Solo usa la librería estándar de Python.

Uso (desde svas-backend/):
    python scripts/generar-seed-tarifas.py ../docs/base_vehiculos_aseguradoras.xlsx

El Excel está desnormalizado (el peso de Toyota se repite en cada fila Toyota):
antes de escribir el SQL se verifica que cada marca, modelo y año traiga
siempre el mismo peso y que cada modelo tenga un solo tipo. Si algo no
cuadra, aborta sin escribir nada.
"""

import html
import re
import sys
import zipfile
from decimal import Decimal, InvalidOperation
from pathlib import Path

SALIDA = Path(__file__).resolve().parent.parent / 'supabase' / 'migrations' / '0017_seed_vehiculos_tarifas.sql'

# Hoja del Excel → código de estrategia (el Excel escribe "Rimac" sin tilde).
ASEGURADORAS = {
    'Rimac': 'RIMAC',
    'Pacífico': 'PACIFICO',
    'La Positiva': 'LA_POSITIVA',
    'Mapfre': 'MAPFRE',
    'Qualitas': 'QUALITAS',
}
# Parámetro propio de cada plan (columna C de "Planes …"); Rímac no tiene.
PARAMETRO_PLAN = {
    'PACIFICO': 'cargo_fijo_anual',
    'LA_POSITIVA': 'recargo_pago_mensual',
    'MAPFRE': 'prima_minima_anual',
    'QUALITAS': 'descuento_comercial',
}


class ErrorDatos(Exception):
    pass


# ── Lectura del xlsx (zip + XML) ─────────────────────────────────────────────
def leer_libro(ruta):
    z = zipfile.ZipFile(ruta)
    libro = z.read('xl/workbook.xml').decode('utf-8')
    rels = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    destino = dict(re.findall(r'<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    destino.update({i: t for t, i in re.findall(r'<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"', rels)})
    compartidos = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss = z.read('xl/sharedStrings.xml').decode('utf-8')
        compartidos = [html.unescape(''.join(re.findall(r'<t[^>]*>([^<]*)</t>', si)))
                       for si in re.findall(r'<si>(.*?)</si>', ss, re.S)]
    hojas = {}
    for nombre, rid in re.findall(r'<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', libro):
        ruta_hoja = 'xl/' + destino[rid].lstrip('/').removeprefix('xl/')
        hojas[html.unescape(nombre)] = leer_hoja(z.read(ruta_hoja).decode('utf-8'), compartidos)
    return hojas


def leer_hoja(xml, compartidos):
    filas = []
    for fila in re.findall(r'<row [^>]*>(.*?)</row>', xml, re.S):
        celdas = {}
        for attrs, cuerpo in re.findall(r'<c ([^>]*?)(?:/>|>(.*?)</c>)', fila, re.S):
            col = re.search(r'r="([A-Z]+)', attrs).group(1)
            t = re.search(r'<t[^>]*>(.*?)</t>', cuerpo or '', re.S)
            v = re.search(r'<v>(.*?)</v>', cuerpo or '')
            if t:
                valor = t.group(1)
            elif v and 't="s"' in attrs:
                valor = compartidos[int(v.group(1))]
            else:
                valor = v.group(1) if v else ''
            celdas[col] = html.unescape(valor).strip()
        filas.append(celdas)
    return filas


def encabezados(filas):
    """Primera fila → {texto del encabezado: columna}."""
    return {texto: col for col, texto in filas[0].items()}


def num(valor, decimales, contexto):
    try:
        d = Decimal(valor)
    except InvalidOperation:
        raise ErrorDatos(f'{contexto}: "{valor}" no es un número')
    return d.quantize(Decimal(1).scaleb(-decimales))


def sql_txt(s):
    return "'" + s.replace("'", "''") + "'"


# ── Extracción y verificación ────────────────────────────────────────────────
def unico(dic, clave, valor, que):
    """Guarda clave→valor; si ya existía con otro valor, el Excel es inconsistente."""
    previo = dic.setdefault(clave, valor)
    if previo != valor:
        raise ErrorDatos(f'{que} {clave}: aparece con {previo} y con {valor}')


def extraer(hojas):
    base = hojas['Base']
    h = encabezados(base)
    tipos_por_modelo, rangos = {}, []
    for i, f in enumerate(base[1:], start=2):
        if not f.get(h['Marca']):
            continue
        marca, modelo, tipo = f[h['Marca']], f[h['Modelo']], f[h['Tipo de vehículo']]
        anio = int(f[h['Año']])
        unico(tipos_por_modelo, (marca, modelo), tipo, 'Tipo del modelo')
        for hoja_nombre, codigo in ASEGURADORAS.items():
            minima = num(f[h[f'{hoja_nombre} - Suma mín (USD)']], 2, f'Base fila {i}')
            maxima = num(f[h[f'{hoja_nombre} - Suma máx (USD)']], 2, f'Base fila {i}')
            if not (0 < minima <= maxima):
                raise ErrorDatos(f'Base fila {i} ({hoja_nombre}): rango {minima}–{maxima} inválido')
            rangos.append((codigo, marca, modelo, anio, minima, maxima))

    pesos = {}  # codigo → {'marca': {}, 'modelo': {}, 'anio': {}, 'tipo': {}}
    for hoja_nombre, codigo in ASEGURADORAS.items():
        filas = hojas[f'Pesos {hoja_nombre}']
        h = encabezados(filas)
        p = {'marca': {}, 'modelo': {}, 'anio': {}, 'tipo': {}}
        for i, f in enumerate(filas[1:], start=2):
            if not f.get(h['Marca']):
                continue
            ctx = f'Pesos {hoja_nombre} fila {i}'
            marca, modelo, anio = f[h['Marca']], f[h['Modelo']], int(f[h['Año']])
            if (marca, modelo) not in tipos_por_modelo:
                raise ErrorDatos(f'{ctx}: {marca} {modelo} no está en la hoja Base')
            unico(p['marca'], marca, num(f[h['Peso marca']], 3, ctx), f'{hoja_nombre} peso marca')
            unico(p['modelo'], (marca, modelo), num(f[h['Peso modelo']], 3, ctx), f'{hoja_nombre} peso modelo')
            unico(p['anio'], anio, num(f[h['Peso año']], 3, ctx), f'{hoja_nombre} peso año')
            if 'Peso tipo' in h:
                unico(p['tipo'], tipos_por_modelo[(marca, modelo)], num(f[h['Peso tipo']], 3, ctx),
                      f'{hoja_nombre} peso tipo')
        for tabla, valores in p.items():
            for clave, peso in valores.items():
                if not (Decimal('0.5') <= peso <= Decimal('3')):
                    raise ErrorDatos(f'{hoja_nombre} peso {tabla} {clave} = {peso} fuera de 0,500–3,000')
        pesos[codigo] = p

    ubigeos = []
    filas = hojas['Ubigeo Pacífico']
    h = encabezados(filas)
    for i, f in enumerate(filas[1:], start=2):
        codigo = f.get(h['Ubigeo'], '')
        if not codigo:
            continue
        if not re.fullmatch(r'\d{6}', codigo):
            raise ErrorDatos(f'Ubigeo Pacífico fila {i}: "{codigo}" no tiene 6 dígitos')
        ubigeos.append((codigo, f[h['Departamento']], f[h['Provincia']], f[h['Distrito']],
                        num(f[h['Peso ubigeo']], 3, f'Ubigeo fila {i}')))
    if len({u[0] for u in ubigeos}) != len(ubigeos):
        raise ErrorDatos('Ubigeo Pacífico: hay códigos repetidos')

    planes = []
    for hoja_nombre, codigo in ASEGURADORAS.items():
        for f in hojas[f'Planes {hoja_nombre}'][1:]:
            nombre, tasa = f.get('A', ''), f.get('B', '')
            if not nombre or not re.fullmatch(r'0?\.\d+', tasa):
                continue
            tasa_d = num(tasa, 4, f'Planes {hoja_nombre}')
            if codigo in PARAMETRO_PLAN:
                valor = Decimal(f['C']).normalize()
                parametros = f'{{"{PARAMETRO_PLAN[codigo]}": {valor:f}}}'
            else:
                parametros = '{}'
            planes.append((codigo, nombre, tasa_d, parametros))

    return tipos_por_modelo, rangos, pesos, ubigeos, planes


# ── Escritura del SQL ────────────────────────────────────────────────────────
def valores(filas, por_linea=1):
    return ',\n'.join('  (' + ', '.join(f) + ')' for f in filas)


def generar(tipos_por_modelo, rangos, pesos, ubigeos, planes):
    marcas = sorted({m for m, _ in tipos_por_modelo})
    tipos = sorted(set(tipos_por_modelo.values()))
    anios = sorted({r[3] for r in rangos})
    n = {
        'marca': len(marcas), 'tipo': len(tipos), 'modelo': len(tipos_por_modelo),
        'ubigeo': len(ubigeos), 'tarifa_plan': len(planes), 'rango': len(rangos),
        'peso_marca': sum(len(p['marca']) for p in pesos.values()),
        'peso_modelo': sum(len(p['modelo']) for p in pesos.values()),
        'peso_anio': sum(len(p['anio']) for p in pesos.values()),
        'peso_tipo': sum(len(p['tipo']) for p in pesos.values()),
        'peso_ubigeo': len(ubigeos),
    }
    out = []
    w = out.append
    w('-- 0017 · Seed de vehículos y tarifas (datos ESTIMADOS, RN-26)')
    w('-- GENERADO por scripts/generar-seed-tarifas.py desde docs/base_vehiculos_aseguradoras.xlsx.')
    w('-- No editar a mano: corregir el Excel y volver a generar (antes de aplicar).')
    w(f"-- {n['marca']} marcas, {n['tipo']} tipos, {n['modelo']} modelos, {n['ubigeo']} ubigeos, "
      f"{n['tarifa_plan']} tarifa_plan, {n['rango']} rangos (años {anios[0]}–{anios[-1]}),")
    w(f"-- {n['peso_marca']} peso_marca, {n['peso_modelo']} peso_modelo, {n['peso_anio']} peso_anio, "
      f"{n['peso_tipo']} peso_tipo, {n['peso_ubigeo']} peso_ubigeo.")
    w('-- Idempotente: ON CONFLICT DO NOTHING. Requiere 0016 (aseguradoras y planes).\n')

    w('insert into svas.marca (nombre) values')
    w(valores([[sql_txt(m)] for m in marcas]))
    w('on conflict (nombre) do nothing;\n')

    w('insert into svas.tipo_vehiculo (nombre) values')
    w(valores([[sql_txt(t)] for t in tipos]))
    w('on conflict (nombre) do nothing;\n')

    w('insert into svas.modelo (marca_id, tipo_id, nombre)')
    w('select ma.id, t.id, v.modelo from (values')
    w(valores([[sql_txt(m), sql_txt(mo), sql_txt(t)] for (m, mo), t in sorted(tipos_por_modelo.items())]))
    w(') as v (marca, modelo, tipo)')
    w('join svas.marca ma on ma.nombre = v.marca')
    w('join svas.tipo_vehiculo t on t.nombre = v.tipo')
    w('on conflict on constraint uq_modelo_marca_nombre do nothing;\n')

    w('insert into svas.ubigeo (codigo, departamento, provincia, distrito) values')
    w(valores([[sql_txt(c), sql_txt(d), sql_txt(p), sql_txt(di)] for c, d, p, di, _ in ubigeos]))
    w('on conflict (codigo) do nothing;\n')

    w('insert into svas.tarifa_plan (plan_id, tasa_base, parametros)')
    w('select p.id, v.tasa_base, v.parametros::jsonb from (values')
    w(valores([[sql_txt(c), sql_txt(nom), str(t), sql_txt(par)] for c, nom, t, par in planes]))
    w(') as v (codigo, plan, tasa_base, parametros)')
    w('join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('join svas.plan p on p.aseguradora_id = a.id and p.nombre = v.plan')
    w('on conflict (plan_id) do nothing;\n')

    w('insert into svas.rango_suma_asegurada (aseguradora_id, modelo_id, anio, suma_minima, suma_maxima)')
    w('select a.id, mo.id, v.anio, v.minima, v.maxima from (values')
    w(valores([[sql_txt(c), sql_txt(m), sql_txt(mo), str(an), str(mi), str(mx)]
               for c, m, mo, an, mi, mx in rangos]))
    w(') as v (codigo, marca, modelo, anio, minima, maxima)')
    w('join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('join svas.marca ma on ma.nombre = v.marca')
    w('join svas.modelo mo on mo.marca_id = ma.id and mo.nombre = v.modelo')
    w('on conflict (aseguradora_id, modelo_id, anio) do nothing;\n')

    filas = [[sql_txt(c), sql_txt(m), str(p)] for c, ps in pesos.items() for m, p in sorted(ps['marca'].items())]
    w('insert into svas.peso_marca (aseguradora_id, marca_id, peso)')
    w('select a.id, ma.id, v.peso from (values')
    w(valores(filas))
    w(') as v (codigo, marca, peso)')
    w('join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('join svas.marca ma on ma.nombre = v.marca')
    w('on conflict (aseguradora_id, marca_id) do nothing;\n')

    filas = [[sql_txt(c), sql_txt(m), sql_txt(mo), str(p)]
             for c, ps in pesos.items() for (m, mo), p in sorted(ps['modelo'].items())]
    w('insert into svas.peso_modelo (aseguradora_id, modelo_id, peso)')
    w('select a.id, mo.id, v.peso from (values')
    w(valores(filas))
    w(') as v (codigo, marca, modelo, peso)')
    w('join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('join svas.marca ma on ma.nombre = v.marca')
    w('join svas.modelo mo on mo.marca_id = ma.id and mo.nombre = v.modelo')
    w('on conflict (aseguradora_id, modelo_id) do nothing;\n')

    filas = [[sql_txt(c), str(an), str(p)] for c, ps in pesos.items() for an, p in sorted(ps['anio'].items())]
    w('insert into svas.peso_anio (aseguradora_id, anio, peso)')
    w('select a.id, v.anio, v.peso from (values')
    w(valores(filas))
    w(') as v (codigo, anio, peso)')
    w('join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('on conflict (aseguradora_id, anio) do nothing;\n')

    filas = [[sql_txt(c), sql_txt(t), str(p)] for c, ps in pesos.items() for t, p in sorted(ps['tipo'].items())]
    w('insert into svas.peso_tipo (aseguradora_id, tipo_id, peso)')
    w('select a.id, t.id, v.peso from (values')
    w(valores(filas))
    w(') as v (codigo, tipo, peso)')
    w('join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('join svas.tipo_vehiculo t on t.nombre = v.tipo')
    w('on conflict (aseguradora_id, tipo_id) do nothing;\n')

    w('insert into svas.peso_ubigeo (aseguradora_id, ubigeo, peso)')
    w("select a.id, v.ubigeo, v.peso from (values")
    w(valores([[sql_txt(c), str(p)] for c, _, _, _, p in ubigeos]))
    w(') as v (ubigeo, peso)')
    w("join svas.aseguradora a on a.codigo_estrategia = 'PACIFICO'")
    w('on conflict (aseguradora_id, ubigeo) do nothing;\n')

    w('-- Verificación: si un join no encontró su fila (nombre distinto), falta algo y se aborta.')
    w('do $$')
    w('begin')
    for tabla, esperado in [('marca', n['marca']), ('tipo_vehiculo', n['tipo']), ('modelo', n['modelo']),
                            ('ubigeo', n['ubigeo']), ('tarifa_plan', n['tarifa_plan']),
                            ('rango_suma_asegurada', n['rango']), ('peso_marca', n['peso_marca']),
                            ('peso_modelo', n['peso_modelo']), ('peso_anio', n['peso_anio']),
                            ('peso_tipo', n['peso_tipo']), ('peso_ubigeo', n['peso_ubigeo'])]:
        w(f"  if (select count(*) from svas.{tabla}) < {esperado} then")
        w(f"    raise exception 'Seed 0017 incompleto: svas.{tabla} tiene menos de {esperado} filas';")
        w('  end if;')
    w('end;')
    w('$$;')
    return '\n'.join(out) + '\n', n


def main():
    # La consola de Windows usa cp1252: forzar UTF-8 para tildes y ✓/✗.
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    if len(sys.argv) != 2:
        sys.exit('Uso: python scripts/generar-seed-tarifas.py ../docs/base_vehiculos_aseguradoras.xlsx')
    try:
        sql, n = generar(*extraer(leer_libro(sys.argv[1])))
    except ErrorDatos as e:
        sys.exit(f'✗ El Excel no es consistente: {e}\n  No se escribió nada.')
    SALIDA.write_text(sql, encoding='utf-8', newline='\n')
    print(f'✓ {SALIDA.name} generado:')
    for clave, valor in n.items():
        print(f'  {clave:<12} {valor}')


if __name__ == '__main__':
    main()
