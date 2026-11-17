"""
Genera supabase/migrations/0039_catalogo_ampliado_2006_2027.sql

Amplía el catálogo de vehículos y sus tarifas (datos ESTIMADOS, RN-26):
  - años 2006–2027 (antes 2015–2026) para los 68 modelos existentes,
  - marcas y modelos nuevos con sus rangos de suma y pesos,
  - pesos de año para los años nuevos.

Uso (desde svas-backend/):
    python scripts/generar-seed-catalogo-ampliado.py

Todo lo editable está en este archivo: la lista de modelos (precio, años en que
se vendió), los niveles de peso por marca y por tipo, y la curva de depreciación.
Después de editar, se vuelve a generar el SQL ANTES de aplicarlo. Una migración
aplicada no se edita: un cambio posterior va en una migración nueva.

Cómo se calculan los números (copiado de lo que ya hay en la base, 0017):
  - suma mínima = precio base 2026 × factor de la aseguradora × depreciación(año),
    redondeada a USD 100; la máxima igual con su factor. El precio base es la
    suma mínima de Rímac para un 2026.
  - depreciación: 12 % anual de 2026 hacia 2015 (0,88^n, igual que el seed
    original); de 2014 hacia atrás baja más lento (6 % anual, un auto viejo ya no
    pierde tanto); 2027 es el inverso de un año (0,88^-1).
  - peso de año: continúa la recta de cada aseguradora (Rímac sube 0,03 por año
    hacia atrás, Pacífico 0,025, etc.).
  - peso de marca: Rímac por nivel de marca; las otras aseguradoras, la recta que
    mejor ajusta las 21 marcas que ya existen.
  - peso de modelo: por tipo de vehículo y aseguradora (como las filas existentes),
    más un recargo en los modelos más robados.
"""

from pathlib import Path

SALIDA = Path(__file__).resolve().parent.parent / 'supabase' / 'migrations' / '0039_catalogo_ampliado_2006_2027.sql'

ANIO_MIN, ANIO_MAX = 2006, 2027
ASEGURADORAS = ['RIMAC', 'PACIFICO', 'LA_POSITIVA', 'MAPFRE', 'QUALITAS']

# Suma mínima / máxima de cada aseguradora respecto de la mínima de Rímac (ajustado a 0017).
FACTOR_MIN = {'RIMAC': 1.000, 'PACIFICO': 1.060, 'LA_POSITIVA': 1.025, 'MAPFRE': 1.040, 'QUALITAS': 0.975}
FACTOR_MAX = {'RIMAC': 1.400, 'PACIFICO': 1.375, 'LA_POSITIVA': 1.350, 'MAPFRE': 1.375, 'QUALITAS': 1.310}

# Peso de año: (valor en 2015, baja por año) por aseguradora; ya existen 2015–2026 (0017).
PESO_ANIO_2015 = {'RIMAC': (1.280, 0.030), 'PACIFICO': (1.175, 0.025), 'LA_POSITIVA': (1.228, 0.028),
                  'MAPFRE': (1.216, 0.026), 'QUALITAS': (1.230, 0.030)}

# Peso de marca: recta de cada aseguradora respecto del peso de Rímac (ajustada a las 21 marcas de 0017).
RECTA_MARCA = {'RIMAC': (0.0, 1.0), 'PACIFICO': (0.078, 0.933), 'LA_POSITIVA': (0.083, 0.922),
               'MAPFRE': (0.065, 0.944), 'QUALITAS': (0.007, 1.032)}

# Peso de modelo por tipo (Sedán, Hatchback, SUV, Pickup, Minivan), como las filas de 0017.
PESO_TIPO_MODELO = {
    'RIMAC':       {'Sedán': 1.00, 'Hatchback': 0.95, 'SUV': 1.10, 'Pickup': 1.20, 'Minivan': 1.05},
    'PACIFICO':    {'Sedán': 1.00, 'Hatchback': 0.97, 'SUV': 1.08, 'Pickup': 1.18, 'Minivan': 1.04},
    'LA_POSITIVA': {'Sedán': 1.00, 'Hatchback': 1.00, 'SUV': 1.00, 'Pickup': 1.00, 'Minivan': 1.00},  # usa peso_tipo aparte
    'MAPFRE':      {'Sedán': 1.00, 'Hatchback': 0.96, 'SUV': 1.09, 'Pickup': 1.19, 'Minivan': 1.04},
    'QUALITAS':    {'Sedán': 1.02, 'Hatchback': 0.98, 'SUV': 1.12, 'Pickup': 1.22, 'Minivan': 1.06},
}
RECARGO_LA_POSITIVA = 1.2  # el recargo por robo pesa un poco más en La Positiva

# ── Marcas nuevas y su peso en Rímac (lujo ≈ 1,30; chinas ≈ 1,10; japonesas ≈ 0,95–1,00) ──────────────
MARCAS_NUEVAS = {
    'BAIC': 1.10, 'BYD': 1.10, 'Changan': 1.10, 'Citroën': 1.10, 'Daihatsu': 1.00, 'DFSK': 1.10,
    'Dodge': 1.15, 'Dongfeng': 1.10, 'Fiat': 1.05, 'Great Wall': 1.10, 'Haval': 1.10, 'Isuzu': 1.05,
    'JMC': 1.10, 'Jeep': 1.15, 'Jetour': 1.10, 'Land Rover': 1.35, 'Lexus': 1.20, 'Lifan': 1.10,
    'Mini': 1.20, 'Porsche': 1.40, 'SsangYong': 1.10, 'Volvo': 1.25,
}

# ── Modelos existentes (0017): primer y último año de venta, solo donde NO es 2006–2027 ──────────────
# Las filas 2015–2026 que ya existen no se tocan; esto solo decide qué años NUEVOS se agregan.
EXISTENTES_DESDE = {
    ('Audi', 'Q3'): 2012, ('Chery', 'Tiggo 7 Pro'): 2019, ('Chevrolet', 'D-Max'): 2012, ('Chevrolet', 'Groove'): 2021,
    ('Chevrolet', 'Onix'): 2014, ('Chevrolet', 'Sail'): 2012, ('Chevrolet', 'Spark GT'): 2011,
    ('Chevrolet', 'Tracker'): 2013, ('Ford', 'Territory'): 2019, ('Geely', 'Coolray'): 2019, ('Honda', 'City'): 2009,
    ('Honda', 'HR-V'): 2015, ('Hyundai', 'Creta'): 2016, ('Hyundai', 'Grand i10'): 2014, ('JAC', 'JS4'): 2021,
    ('Kia', 'Seltos'): 2019, ('MG', 'ZS'): 2018, ('Mazda', 'BT-50'): 2008, ('Mazda', 'CX-30'): 2020,
    ('Mazda', 'CX-5'): 2012, ('Mazda', 'Mazda 2'): 2008, ('Mitsubishi', 'ASX'): 2011, ('Nissan', 'Kicks'): 2017,
    ('Nissan', 'Qashqai'): 2008, ('Nissan', 'Versa'): 2012, ('Peugeot', '2008'): 2014, ('Renault', 'Duster'): 2012,
    ('Renault', 'Kwid'): 2017, ('Renault', 'Logan'): 2008, ('Subaru', 'XV'): 2012, ('Suzuki', 'Baleno'): 2016,
    ('Suzuki', 'Ertiga'): 2013, ('Suzuki', 'S-Presso'): 2020, ('Suzuki', 'Vitara'): 2015,
    ('Toyota', 'Corolla Cross'): 2021, ('Toyota', 'Rush'): 2019, ('Volkswagen', 'Amarok'): 2011,
    ('Volkswagen', 'T-Cross'): 2020, ('Volkswagen', 'Tiguan'): 2008,
}
EXISTENTES_HASTA = {('Volkswagen', 'Gol'): 2025, ('Chevrolet', 'Spark GT'): 2024, ('Ford', 'Escape'): 2024}

# ── Modelos nuevos: (marca, modelo, tipo, precio base 2026 = suma mínima de Rímac en USD, desde, hasta, recargo) ──
# "desde/hasta" = años modelo en que se vendió en Perú (aproximado). "recargo" = extra al peso del modelo (robos).
M = [
    # Toyota
    ('Toyota', 'Avanza', 'Minivan', 13600, 2006, 2027, 0), ('Toyota', 'Etios', 'Hatchback', 9600, 2013, 2020, 0),
    ('Toyota', 'Fortuner', 'SUV', 32800, 2006, 2027, 0.05), ('Toyota', 'Land Cruiser Prado', 'SUV', 46400, 2006, 2027, 0.05),
    ('Toyota', 'Raize', 'SUV', 16000, 2022, 2027, 0), ('Toyota', 'Camry', 'Sedán', 26400, 2006, 2027, 0),
    # Hyundai
    ('Hyundai', 'i10', 'Hatchback', 8800, 2008, 2016, 0), ('Hyundai', 'Eon', 'Hatchback', 7600, 2012, 2019, 0),
    ('Hyundai', 'Atos', 'Hatchback', 6800, 2006, 2012, 0), ('Hyundai', 'Getz', 'Hatchback', 8000, 2006, 2011, 0),
    ('Hyundai', 'Venue', 'SUV', 15600, 2020, 2027, 0), ('Hyundai', 'Kona', 'SUV', 20800, 2018, 2027, 0),
    ('Hyundai', 'H-1', 'Minivan', 31200, 2008, 2027, 0), ('Hyundai', 'Palisade', 'SUV', 46000, 2020, 2027, 0),
    ('Hyundai', 'Sonata', 'Sedán', 24000, 2006, 2027, 0),
    # Kia
    ('Kia', 'Soluto', 'Sedán', 10400, 2019, 2027, 0), ('Kia', 'Sonet', 'SUV', 15200, 2021, 2027, 0),
    ('Kia', 'Carnival', 'Minivan', 36000, 2006, 2027, 0), ('Kia', 'Stonic', 'SUV', 17600, 2018, 2027, 0),
    ('Kia', 'Soul', 'SUV', 17200, 2010, 2022, 0), ('Kia', 'Optima', 'Sedán', 22000, 2011, 2020, 0),
    # Nissan
    ('Nissan', 'March', 'Hatchback', 9600, 2012, 2022, 0), ('Nissan', 'Note', 'Hatchback', 13600, 2013, 2020, 0),
    ('Nissan', 'Navara', 'Pickup', 28000, 2015, 2022, 0.05), ('Nissan', 'Pathfinder', 'SUV', 38000, 2006, 2027, 0),
    ('Nissan', 'Murano', 'SUV', 32000, 2006, 2022, 0), ('Nissan', 'Juke', 'SUV', 15200, 2012, 2019, 0),
    ('Nissan', 'Tiida', 'Sedán', 11600, 2006, 2018, 0.03),
    # Suzuki
    ('Suzuki', 'Alto', 'Hatchback', 7200, 2006, 2027, 0), ('Suzuki', 'Dzire', 'Sedán', 10400, 2018, 2027, 0),
    ('Suzuki', 'Grand Vitara', 'SUV', 20800, 2006, 2022, 0), ('Suzuki', 'Celerio', 'Hatchback', 8400, 2014, 2027, 0),
    ('Suzuki', 'Ignis', 'Hatchback', 10000, 2017, 2024, 0), ('Suzuki', 'S-Cross', 'SUV', 21200, 2014, 2022, 0),
    ('Suzuki', 'SX4', 'SUV', 14000, 2007, 2016, 0), ('Suzuki', 'Fronx', 'SUV', 17600, 2024, 2027, 0),
    # Chevrolet
    ('Chevrolet', 'Aveo', 'Sedán', 10000, 2006, 2018, 0), ('Chevrolet', 'Beat', 'Hatchback', 8000, 2012, 2017, 0),
    ('Chevrolet', 'Cruze', 'Sedán', 18000, 2009, 2022, 0), ('Chevrolet', 'Captiva', 'SUV', 24000, 2008, 2022, 0),
    ('Chevrolet', 'Optra', 'Sedán', 8800, 2006, 2012, 0), ('Chevrolet', 'Sonic', 'Sedán', 12000, 2012, 2019, 0),
    ('Chevrolet', 'Trailblazer', 'SUV', 36000, 2013, 2027, 0), ('Chevrolet', 'Equinox', 'SUV', 30000, 2018, 2027, 0),
    # Mazda
    ('Mazda', 'CX-3', 'SUV', 21200, 2016, 2027, 0), ('Mazda', 'CX-9', 'SUV', 40000, 2007, 2027, 0),
    ('Mazda', 'CX-7', 'SUV', 25600, 2007, 2012, 0), ('Mazda', 'Mazda 6', 'Sedán', 27000, 2006, 2027, 0),
    ('Mazda', 'CX-50', 'SUV', 32000, 2023, 2027, 0),
    # Honda
    ('Honda', 'Fit', 'Hatchback', 14400, 2006, 2020, 0), ('Honda', 'Accord', 'Sedán', 30400, 2006, 2022, 0),
    ('Honda', 'Pilot', 'SUV', 41600, 2006, 2027, 0), ('Honda', 'Brio', 'Hatchback', 9600, 2014, 2020, 0),
    ('Honda', 'WR-V', 'SUV', 18400, 2023, 2027, 0),
    # Volkswagen
    ('Volkswagen', 'Polo', 'Hatchback', 12000, 2006, 2027, 0), ('Volkswagen', 'Virtus', 'Sedán', 16000, 2019, 2027, 0),
    ('Volkswagen', 'Jetta', 'Sedán', 22000, 2006, 2027, 0), ('Volkswagen', 'Golf', 'Hatchback', 22000, 2006, 2027, 0),
    ('Volkswagen', 'Passat', 'Sedán', 28000, 2006, 2021, 0), ('Volkswagen', 'Saveiro', 'Pickup', 12000, 2008, 2027, 0),
    ('Volkswagen', 'Taos', 'SUV', 26400, 2022, 2027, 0), ('Volkswagen', 'Nivus', 'SUV', 20000, 2022, 2027, 0),
    ('Volkswagen', 'Touareg', 'SUV', 48000, 2006, 2027, 0), ('Volkswagen', 'Fox', 'Hatchback', 9600, 2006, 2021, 0),
    # Ford
    ('Ford', 'EcoSport', 'SUV', 15200, 2006, 2022, 0), ('Ford', 'Fiesta', 'Hatchback', 10400, 2006, 2019, 0),
    ('Ford', 'Focus', 'Sedán', 16000, 2006, 2019, 0), ('Ford', 'Fusion', 'Sedán', 22000, 2006, 2020, 0),
    ('Ford', 'Explorer', 'SUV', 41600, 2006, 2027, 0), ('Ford', 'Edge', 'SUV', 31200, 2007, 2023, 0),
    ('Ford', 'Kuga', 'SUV', 20000, 2013, 2022, 0),
    # Mitsubishi
    ('Mitsubishi', 'Montero Sport', 'SUV', 36000, 2008, 2027, 0.05), ('Mitsubishi', 'Montero', 'SUV', 42000, 2006, 2021, 0.05),
    ('Mitsubishi', 'Eclipse Cross', 'SUV', 24000, 2019, 2027, 0), ('Mitsubishi', 'Mirage', 'Hatchback', 9600, 2013, 2022, 0),
    ('Mitsubishi', 'Lancer', 'Sedán', 14400, 2006, 2017, 0), ('Mitsubishi', 'Xpander', 'Minivan', 20000, 2019, 2027, 0),
    # Renault
    ('Renault', 'Sandero', 'Hatchback', 10000, 2008, 2027, 0), ('Renault', 'Sandero Stepway', 'Hatchback', 11200, 2010, 2027, 0),
    ('Renault', 'Symbol', 'Sedán', 10000, 2008, 2013, 0), ('Renault', 'Captur', 'SUV', 18400, 2017, 2027, 0),
    ('Renault', 'Koleos', 'SUV', 25000, 2009, 2027, 0), ('Renault', 'Oroch', 'Pickup', 17000, 2016, 2027, 0),
    # Peugeot
    ('Peugeot', '208', 'Hatchback', 14000, 2013, 2027, 0), ('Peugeot', '3008', 'SUV', 28000, 2010, 2027, 0),
    ('Peugeot', '308', 'Hatchback', 18000, 2009, 2027, 0), ('Peugeot', '301', 'Sedán', 12000, 2013, 2022, 0),
    ('Peugeot', '207', 'Hatchback', 9600, 2008, 2014, 0),
    # Subaru
    ('Subaru', 'Impreza', 'Sedán', 22000, 2008, 2027, 0), ('Subaru', 'Outback', 'SUV', 32000, 2006, 2027, 0),
    # Audi
    ('Audi', 'A3', 'Sedán', 26000, 2006, 2027, 0), ('Audi', 'A4', 'Sedán', 34000, 2006, 2027, 0),
    ('Audi', 'Q5', 'SUV', 46000, 2009, 2027, 0), ('Audi', 'Q7', 'SUV', 62000, 2006, 2027, 0),
    # BMW
    ('BMW', 'Serie 1', 'Hatchback', 28000, 2006, 2027, 0), ('BMW', 'Serie 5', 'Sedán', 54000, 2006, 2027, 0),
    ('BMW', 'X1', 'SUV', 36000, 2010, 2027, 0), ('BMW', 'X3', 'SUV', 46000, 2006, 2027, 0),
    ('BMW', 'X5', 'SUV', 66000, 2006, 2027, 0),
    # Mercedes-Benz
    ('Mercedes-Benz', 'Clase A', 'Hatchback', 32000, 2006, 2027, 0), ('Mercedes-Benz', 'Clase E', 'Sedán', 56000, 2006, 2027, 0),
    ('Mercedes-Benz', 'GLA', 'SUV', 38000, 2014, 2027, 0), ('Mercedes-Benz', 'GLC', 'SUV', 52000, 2016, 2027, 0),
    # Chery
    ('Chery', 'Tiggo 2', 'SUV', 11200, 2018, 2027, 0), ('Chery', 'Tiggo 4', 'SUV', 14000, 2019, 2027, 0),
    ('Chery', 'Tiggo 8', 'SUV', 24000, 2019, 2027, 0), ('Chery', 'QQ', 'Hatchback', 6400, 2008, 2018, 0),
    ('Chery', 'Arrizo 5', 'Sedán', 11200, 2017, 2022, 0),
    # Geely
    ('Geely', 'Emgrand', 'Sedán', 10000, 2012, 2020, 0), ('Geely', 'Azkarra', 'SUV', 26000, 2022, 2027, 0),
    # MG
    ('MG', 'MG3', 'Hatchback', 11200, 2013, 2027, 0), ('MG', 'MG5', 'Sedán', 14400, 2022, 2027, 0),
    ('MG', 'HS', 'SUV', 22000, 2021, 2027, 0), ('MG', 'RX5', 'SUV', 21000, 2019, 2024, 0),
    # JAC
    ('JAC', 'S2', 'SUV', 12000, 2018, 2027, 0), ('JAC', 'S3', 'SUV', 14000, 2018, 2027, 0),
    ('JAC', 'T6', 'Pickup', 18000, 2016, 2027, 0), ('JAC', 'T8', 'Pickup', 22000, 2018, 2027, 0),
    # Marcas nuevas
    ('Citroën', 'C3', 'Hatchback', 12000, 2006, 2027, 0), ('Citroën', 'C-Elysée', 'Sedán', 11200, 2014, 2022, 0),
    ('Citroën', 'C4 Cactus', 'SUV', 20000, 2018, 2020, 0), ('Citroën', 'C5 Aircross', 'SUV', 26400, 2020, 2027, 0),
    ('Jeep', 'Renegade', 'SUV', 22000, 2016, 2027, 0), ('Jeep', 'Compass', 'SUV', 28000, 2017, 2027, 0),
    ('Jeep', 'Grand Cherokee', 'SUV', 52000, 2006, 2027, 0), ('Jeep', 'Wrangler', 'SUV', 46000, 2007, 2027, 0),
    ('Volvo', 'XC40', 'SUV', 36000, 2019, 2027, 0), ('Volvo', 'XC60', 'SUV', 46000, 2009, 2027, 0),
    ('Volvo', 'XC90', 'SUV', 62000, 2006, 2027, 0), ('Volvo', 'S60', 'Sedán', 38000, 2011, 2023, 0),
    ('Lexus', 'NX', 'SUV', 44000, 2015, 2027, 0), ('Lexus', 'RX', 'SUV', 62000, 2006, 2027, 0),
    ('Lexus', 'UX', 'SUV', 36000, 2019, 2027, 0),
    ('Land Rover', 'Range Rover Evoque', 'SUV', 52000, 2012, 2027, 0), ('Land Rover', 'Discovery Sport', 'SUV', 48000, 2015, 2027, 0),
    ('Land Rover', 'Defender', 'SUV', 68000, 2020, 2027, 0), ('Land Rover', 'Freelander', 'SUV', 26000, 2006, 2014, 0),
    ('Porsche', 'Macan', 'SUV', 72000, 2015, 2027, 0), ('Porsche', 'Cayenne', 'SUV', 92000, 2006, 2027, 0),
    ('Mini', 'Cooper', 'Hatchback', 28000, 2006, 2027, 0), ('Mini', 'Countryman', 'SUV', 34000, 2011, 2027, 0),
    ('Isuzu', 'D-Max', 'Pickup', 26000, 2012, 2027, 0), ('Isuzu', 'MU-X', 'SUV', 36000, 2021, 2027, 0),
    ('Great Wall', 'Wingle 5', 'Pickup', 15000, 2012, 2020, 0), ('Great Wall', 'Wingle 7', 'Pickup', 22000, 2019, 2027, 0),
    ('Great Wall', 'Poer', 'Pickup', 26000, 2020, 2027, 0),
    ('Haval', 'H6', 'SUV', 24000, 2012, 2027, 0), ('Haval', 'Jolion', 'SUV', 20800, 2021, 2027, 0),
    ('Haval', 'H2', 'SUV', 14000, 2014, 2020, 0), ('Haval', 'Dargo', 'SUV', 28000, 2022, 2027, 0),
    ('BYD', 'F3', 'Sedán', 9600, 2008, 2015, 0), ('BYD', 'Song Plus', 'SUV', 32000, 2021, 2027, 0),
    ('BYD', 'Dolphin', 'Hatchback', 23000, 2023, 2027, 0), ('BYD', 'Yuan Plus', 'SUV', 28000, 2023, 2027, 0),
    ('BYD', 'Seal', 'Sedán', 42000, 2023, 2027, 0),
    ('Changan', 'CS15', 'SUV', 11200, 2018, 2027, 0), ('Changan', 'CS35 Plus', 'SUV', 16000, 2019, 2027, 0),
    ('Changan', 'CS55 Plus', 'SUV', 22400, 2020, 2027, 0), ('Changan', 'Alsvin', 'Sedán', 11200, 2019, 2027, 0),
    ('BAIC', 'X25', 'SUV', 11200, 2018, 2027, 0), ('BAIC', 'X35', 'SUV', 14000, 2018, 2027, 0),
    ('BAIC', 'BJ40', 'SUV', 30000, 2021, 2027, 0),
    ('JMC', 'Vigus', 'Pickup', 17000, 2018, 2027, 0),
    ('DFSK', 'Glory 580', 'SUV', 20000, 2019, 2027, 0), ('DFSK', 'Glory 500', 'SUV', 15000, 2018, 2027, 0),
    ('Dongfeng', 'Rich', 'Pickup', 18000, 2019, 2027, 0), ('Dongfeng', 'AX7', 'SUV', 17000, 2019, 2024, 0),
    ('Jetour', 'X70', 'SUV', 22000, 2020, 2027, 0), ('Jetour', 'X90 Plus', 'SUV', 28000, 2022, 2027, 0),
    ('Jetour', 'Dashing', 'SUV', 26000, 2023, 2027, 0),
    ('SsangYong', 'Tivoli', 'SUV', 16800, 2016, 2027, 0), ('SsangYong', 'Korando', 'SUV', 22000, 2011, 2027, 0),
    ('SsangYong', 'Rexton', 'SUV', 38000, 2006, 2027, 0), ('SsangYong', 'Actyon', 'Pickup', 22000, 2008, 2018, 0),
    ('Fiat', 'Uno', 'Hatchback', 8000, 2006, 2027, 0), ('Fiat', 'Palio', 'Hatchback', 8000, 2006, 2020, 0),
    ('Fiat', 'Argo', 'Hatchback', 12000, 2018, 2027, 0), ('Fiat', 'Mobi', 'Hatchback', 8800, 2017, 2027, 0),
    ('Fiat', 'Cronos', 'Sedán', 13200, 2018, 2027, 0), ('Fiat', 'Toro', 'Pickup', 28000, 2017, 2027, 0),
    ('Daihatsu', 'Terios', 'SUV', 14000, 2006, 2017, 0), ('Daihatsu', 'Sirion', 'Hatchback', 9600, 2006, 2018, 0),
    ('Daihatsu', 'Rocky', 'SUV', 16800, 2020, 2027, 0),
    ('Dodge', 'Journey', 'SUV', 26000, 2009, 2020, 0), ('Dodge', 'Durango', 'SUV', 50000, 2006, 2027, 0),
    ('Lifan', 'X60', 'SUV', 12000, 2013, 2020, 0), ('Lifan', '520', 'Sedán', 9000, 2008, 2014, 0),
]

DEP_ANTIGUA = 0.94   # depreciación anual de 2014 hacia atrás (más lenta que la de 2015–2026)
DEP_NUEVA = 0.88     # depreciación anual de 2026 hacia 2015 (0017)


def d(x):
    return f'{x:.3f}'


def sql_txt(s):
    return "'" + s.replace("'", "''") + "'"


def validar():
    claves = [(m[0], m[1]) for m in M]
    if len(set(claves)) != len(claves):
        raise SystemExit('Hay modelos nuevos repetidos: ' + str([c for c in claves if claves.count(c) > 1]))
    tipos = {'Sedán', 'Hatchback', 'SUV', 'Pickup', 'Minivan'}
    marcas_existentes = {'Audi', 'BMW', 'Chery', 'Chevrolet', 'Ford', 'Geely', 'Honda', 'Hyundai', 'JAC', 'Kia', 'MG',
                         'Mazda', 'Mercedes-Benz', 'Mitsubishi', 'Nissan', 'Peugeot', 'Renault', 'Subaru', 'Suzuki',
                         'Toyota', 'Volkswagen'}
    for marca, modelo, tipo, base, desde, hasta, rec in M:
        if tipo not in tipos:
            raise SystemExit(f'{marca} {modelo}: tipo {tipo} no existe')
        if marca not in marcas_existentes and marca not in MARCAS_NUEVAS:
            raise SystemExit(f'{marca} {modelo}: marca sin peso (agrégala a MARCAS_NUEVAS)')
        if not (ANIO_MIN <= desde <= hasta <= ANIO_MAX):
            raise SystemExit(f'{marca} {modelo}: años {desde}–{hasta} fuera de {ANIO_MIN}–{ANIO_MAX}')
        if base < 4000 or base % 100:
            raise SystemExit(f'{marca} {modelo}: precio base {base} raro')
    for m in MARCAS_NUEVAS:
        if not any(x[0] == m for x in M):
            raise SystemExit(f'La marca nueva {m} no tiene modelos')


def peso(valor, que):
    if not (0.5 <= valor <= 3):
        raise SystemExit(f'{que} = {valor} fuera de 0,500–3,000')
    return valor


def generar():
    validar()
    marcas = sorted(MARCAS_NUEVAS)
    n_modelos = len(M)
    out = []
    w = out.append
    w('-- 0039 · Catálogo ampliado: años 2006–2027 y modelos nuevos (datos ESTIMADOS, RN-26)')
    w('-- GENERADO por scripts/generar-seed-catalogo-ampliado.py. No editar a mano: cambiar el script y volver a generar')
    w('-- (antes de aplicar). Una migración aplicada no se edita: un cambio posterior va en una migración nueva.')
    w('--')
    w(f'-- Agrega {len(marcas)} marcas, {n_modelos} modelos, sus rangos de suma y pesos, y extiende los años de los 68')
    w('-- modelos de 0017 a 2006–2027. Las filas que ya existen NO se tocan; todo es ON CONFLICT DO NOTHING.')
    w('-- Reglas de cálculo: ver el encabezado del script (depreciación, factores por aseguradora, pesos).')
    w('-- También actualiza el texto del requisito de antigüedad de los planes (informativo, RN-44).')
    w('-- Requiere 0016 y 0017.')
    w('')
    w('-- ── Marcas nuevas ───────────────────────────────────────────────────────────')
    w('insert into svas.marca (nombre) values')
    w(',\n'.join(f'  ({sql_txt(m)})' for m in marcas))
    w('on conflict (nombre) do nothing;')
    w('')
    w('-- ── Modelos nuevos (el tipo sale del modelo, el cliente no lo escribe) ───────')
    w('insert into svas.modelo (marca_id, tipo_id, nombre)')
    w('select ma.id, t.id, v.modelo from (values')
    w(',\n'.join(f'  ({sql_txt(m[0])}, {sql_txt(m[1])}, {sql_txt(m[2])})' for m in M))
    w(') v(marca, modelo, tipo)')
    w('  join svas.marca ma on ma.nombre = v.marca')
    w('  join svas.tipo_vehiculo t on t.nombre = v.tipo')
    w('on conflict (marca_id, nombre) do nothing;')
    w('')
    w('-- ── Datos de trabajo (se borran al terminar la transacción) ──────────────────')
    w('create temp table _factor (codigo text primary key, fmin numeric not null, fmax numeric not null) on commit drop;')
    w('insert into _factor values')
    w(',\n'.join(f"  ('{a}', {d(FACTOR_MIN[a])}, {d(FACTOR_MAX[a])})" for a in ASEGURADORAS) + ';')
    w('')
    w('-- Modelos nuevos: precio base 2026 (suma mínima de Rímac) y años en que se vendió.')
    w('create temp table _modelo_nuevo (marca text, modelo text, base numeric not null, desde int not null, hasta int not null,')
    w('                                  primary key (marca, modelo)) on commit drop;')
    w('insert into _modelo_nuevo values')
    w(',\n'.join(f'  ({sql_txt(m[0])}, {sql_txt(m[1])}, {m[3]}, {m[4]}, {m[5]})' for m in M) + ';')
    w('')
    w('-- Modelos de 0017: primer y último año de venta (solo cambia lo que no es 2006–2027).')
    w('create temp table _modelo_existente (marca text, modelo text, desde int not null, hasta int not null,')
    w('                                     primary key (marca, modelo)) on commit drop;')
    w('insert into _modelo_existente')
    w('select ma.nombre, mo.nombre, coalesce(o.desde, 2006), coalesce(o.hasta, 2027)')
    w('  from svas.modelo mo')
    w('  join svas.marca ma on ma.id = mo.marca_id')
    w('  left join (values')
    desde_h = {k: [v, ANIO_MAX] for k, v in EXISTENTES_DESDE.items()}
    for k, v in EXISTENTES_HASTA.items():
        desde_h.setdefault(k, [ANIO_MIN, ANIO_MAX])[1] = v
    w(',\n'.join(f'    ({sql_txt(k[0])}, {sql_txt(k[1])}, {v[0]}, {v[1]})' for k, v in sorted(desde_h.items())))
    w('  ) o(marca, modelo, desde, hasta) on o.marca = ma.nombre and o.modelo = mo.nombre')
    w(' where not exists (select 1 from _modelo_nuevo n where n.marca = ma.nombre and n.modelo = mo.nombre);')
    w('')
    w('-- ── Rangos de suma de los modelos nuevos ─────────────────────────────────────')
    w('-- suma = base × factor de la aseguradora × depreciación del año, redondeada a USD 100.')
    w(f'-- Depreciación: {DEP_NUEVA} ^ (2026 − año) de 2015 a 2026; la de 2015 × {DEP_ANTIGUA} ^ (2015 − año) hacia atrás; 2027 = 1 / {DEP_NUEVA}.')
    w('insert into svas.rango_suma_asegurada (aseguradora_id, modelo_id, anio, suma_minima, suma_maxima)')
    w('select a.id, mo.id, y.anio,')
    w('       round(n.base * dep.f * f.fmin / 100) * 100,')
    w('       round(n.base * dep.f * f.fmax / 100) * 100')
    w('  from _modelo_nuevo n')
    w('  join svas.marca ma on ma.nombre = n.marca')
    w('  join svas.modelo mo on mo.marca_id = ma.id and mo.nombre = n.modelo')
    w('  cross join _factor f')
    w('  join svas.aseguradora a on a.codigo_estrategia = f.codigo')
    w('  cross join lateral generate_series(n.desde, n.hasta) as y(anio)')
    w('  cross join lateral (select case')
    w(f'      when y.anio between 2015 and 2026 then power({DEP_NUEVA}::numeric, 2026 - y.anio)')
    w(f'      when y.anio = 2027 then 1 / {DEP_NUEVA}::numeric')
    w(f'      else power({DEP_NUEVA}::numeric, 11) * power({DEP_ANTIGUA}::numeric, 2015 - y.anio) end as f) dep')
    w('on conflict (aseguradora_id, modelo_id, anio) do nothing;')
    w('')
    w('-- ── Años nuevos de los modelos de 0017: hacia atrás desde su 2015, y 2027 desde su 2026 ──')
    w('-- Se parte de la fila real de cada aseguradora, así conserva sus diferencias.')
    w('insert into svas.rango_suma_asegurada (aseguradora_id, modelo_id, anio, suma_minima, suma_maxima)')
    w('select r.aseguradora_id, r.modelo_id, y.anio,')
    w(f'       round(r.suma_minima * power({DEP_ANTIGUA}::numeric, 2015 - y.anio) / 100) * 100,')
    w(f'       round(r.suma_maxima * power({DEP_ANTIGUA}::numeric, 2015 - y.anio) / 100) * 100')
    w('  from svas.rango_suma_asegurada r')
    w('  join svas.modelo mo on mo.id = r.modelo_id')
    w('  join svas.marca ma on ma.id = mo.marca_id')
    w('  join _modelo_existente e on e.marca = ma.nombre and e.modelo = mo.nombre')
    w('  cross join lateral generate_series(greatest(2006, e.desde), 2014) as y(anio)')
    w(' where r.anio = 2015')
    w('on conflict (aseguradora_id, modelo_id, anio) do nothing;')
    w('')
    w('insert into svas.rango_suma_asegurada (aseguradora_id, modelo_id, anio, suma_minima, suma_maxima)')
    w('select r.aseguradora_id, r.modelo_id, 2027,')
    w(f'       round(r.suma_minima / {DEP_NUEVA}::numeric / 100) * 100,')
    w(f'       round(r.suma_maxima / {DEP_NUEVA}::numeric / 100) * 100')
    w('  from svas.rango_suma_asegurada r')
    w('  join svas.modelo mo on mo.id = r.modelo_id')
    w('  join svas.marca ma on ma.id = mo.marca_id')
    w('  join _modelo_existente e on e.marca = ma.nombre and e.modelo = mo.nombre')
    w(' where r.anio = 2026 and e.hasta >= 2027')
    w('on conflict (aseguradora_id, modelo_id, anio) do nothing;')
    w('')

    # ── Pesos ────────────────────────────────────────────────────────────────
    w('-- ── Peso de año: continúa la recta de cada aseguradora (2006–2014 y 2027) ───')
    filas = []
    n_pa = 0
    for a in ASEGURADORAS:
        base, paso = PESO_ANIO_2015[a]
        for anio in list(range(2006, 2015)) + [2027]:
            v = peso(round(base + (2015 - anio) * paso, 3), f'peso año {a} {anio}')
            filas.append(f"  ('{a}', {anio}, {d(v)})")
            n_pa += 1
    w('insert into svas.peso_anio (aseguradora_id, anio, peso)')
    w('select a.id, v.anio, v.peso from (values')
    w(',\n'.join(filas))
    w(') v(codigo, anio, peso) join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('on conflict (aseguradora_id, anio) do nothing;')
    w('')
    w('-- ── Peso de marca de las marcas nuevas ──────────────────────────────────────')
    filas = []
    for a in ASEGURADORAS:
        c, b = RECTA_MARCA[a]
        for marca in marcas:
            v = peso(round(round(c + b * MARCAS_NUEVAS[marca], 2), 3), f'peso marca {a} {marca}')
            filas.append(f"  ('{a}', {sql_txt(marca)}, {d(v)})")
    n_pm = len(filas)
    w('insert into svas.peso_marca (aseguradora_id, marca_id, peso)')
    w('select a.id, ma.id, v.peso from (values')
    w(',\n'.join(filas))
    w(') v(codigo, marca, peso)')
    w('  join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('  join svas.marca ma on ma.nombre = v.marca')
    w('on conflict (aseguradora_id, marca_id) do nothing;')
    w('')
    w('-- ── Peso de modelo de los modelos nuevos (por tipo, más recargo en los más robados) ──')
    filas = []
    for a in ASEGURADORAS:
        for marca, modelo, tipo, _, _, _, rec in M:
            extra = rec * (RECARGO_LA_POSITIVA if a == 'LA_POSITIVA' else 1)
            v = peso(round(PESO_TIPO_MODELO[a][tipo] + extra, 3), f'peso modelo {a} {marca} {modelo}')
            filas.append(f"  ('{a}', {sql_txt(marca)}, {sql_txt(modelo)}, {d(v)})")
    n_pmo = len(filas)
    w('insert into svas.peso_modelo (aseguradora_id, modelo_id, peso)')
    w('select a.id, mo.id, v.peso from (values')
    w(',\n'.join(filas))
    w(') v(codigo, marca, modelo, peso)')
    w('  join svas.aseguradora a on a.codigo_estrategia = v.codigo')
    w('  join svas.marca ma on ma.nombre = v.marca')
    w('  join svas.modelo mo on mo.marca_id = ma.id and mo.nombre = v.modelo')
    w('on conflict (aseguradora_id, modelo_id) do nothing;')
    w('')
    w('-- ── Requisito de antigüedad de los planes (informativo, RN-44) ───────────────')
    w("update svas.plan_requisito")
    w("   set texto = 'Vehículo del año 2006 al 2027 (antigüedad máxima 20 años)'")
    w(" where texto = 'Vehículo del año 2015 al 2026 (antigüedad máxima 12 años)';")
    w('')
    return '\n'.join(out), dict(marcas=len(marcas), modelos=n_modelos, peso_anio=n_pa, peso_marca=n_pm, peso_modelo=n_pmo)


if __name__ == '__main__':
    sql, resumen = generar()
    SALIDA.write_text(sql, encoding='utf-8', newline='\n')
    print(f'Escrito {SALIDA} ({len(sql.splitlines())} líneas)')
    print(resumen)
