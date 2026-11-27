import { MigrationInterface, QueryRunner } from 'typeorm';

// Contornos das regiões piloto de Lavras no lugar da grade de retângulos: o Centro é um
// círculo e as quatro zonas são setores de um anel em volta dele. Continuam aproximados
// (não são limites oficiais de bairro). As regiões vizinhas usam os mesmos vértices na
// divisa, para não sobrar buraco nem sobreposição.

const CENTRO = { lon: -45.0, lat: -21.245 };
const RAIO_CENTRO = 0.0065; // em graus de latitude, cerca de 0,7 km
const RAIO_EXTERNO = 0.0215; // cerca de 2,4 km
const PASSO = 5; // graus entre dois vértices de um arco

// Um grau de longitude é mais curto que um de latitude; sem a correção o círculo sai oval.
const GRAUS_LON_POR_GRAU_LAT = 1 / Math.cos((CENTRO.lat * Math.PI) / 180);

/** Vértice a `raio` do centro; o ângulo é em graus, anti-horário a partir do leste. */
function vertice(raio: number, angulo: number): string {
  const rad = (angulo * Math.PI) / 180;
  const lon = CENTRO.lon + raio * GRAUS_LON_POR_GRAU_LAT * Math.cos(rad);
  const lat = CENTRO.lat + raio * Math.sin(rad);
  return `${lon.toFixed(6)} ${lat.toFixed(6)}`;
}

function arco(raio: number, de: number, ate: number): string[] {
  const vertices: string[] = [];
  for (let angulo = de; angulo <= ate; angulo += PASSO) vertices.push(vertice(raio, angulo));
  return vertices;
}

function setor(de: number, ate: number): string {
  const externo = arco(RAIO_EXTERNO, de, ate);
  const interno = arco(RAIO_CENTRO, de, ate).reverse();
  return [...externo, ...interno, externo[0]].join(', ');
}

const CONTORNOS: Record<string, string> = {
  'LAV-CENTRO': arco(RAIO_CENTRO, 0, 360).join(', '),
  'LAV-LESTE': setor(-45, 45),
  'LAV-NORTE': setor(45, 135),
  'LAV-OESTE': setor(135, 225),
  'LAV-SUL': setor(225, 315),
};

const GRADE: Record<string, string> = {
  'LAV-CENTRO': '-45.005 -21.250, -44.995 -21.250, -44.995 -21.240, -45.005 -21.240, -45.005 -21.250',
  'LAV-NORTE': '-45.005 -21.240, -44.995 -21.240, -44.995 -21.225, -45.005 -21.225, -45.005 -21.240',
  'LAV-SUL': '-45.005 -21.265, -44.995 -21.265, -44.995 -21.250, -45.005 -21.250, -45.005 -21.265',
  'LAV-LESTE': '-44.995 -21.265, -44.975 -21.265, -44.975 -21.225, -44.995 -21.225, -44.995 -21.265',
  'LAV-OESTE': '-45.025 -21.265, -45.005 -21.265, -45.005 -21.225, -45.025 -21.225, -45.025 -21.265',
};

async function aplicar(queryRunner: QueryRunner, codigo: string, anel: string): Promise<void> {
  await queryRunner.query(
    `UPDATE regioes
        SET geometria = g,
            caracteristicas = jsonb_set(
              caracteristicas, '{areaKm2}',
              to_jsonb(round((ST_Area(g::geography) / 1e6)::numeric, 2))),
            atualizada_em = now()
       FROM (SELECT ST_Multi(ST_GeomFromText($2, 4326)) AS g) AS geo
      WHERE codigo = $1`,
    [codigo, `POLYGON((${anel}))`],
  );
}

export class ContornosEmSetores1764100000000 implements MigrationInterface {
  name = 'ContornosEmSetores1764100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [codigo, anel] of Object.entries(CONTORNOS)) {
      await aplicar(queryRunner, codigo, anel);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [codigo, anel] of Object.entries(GRADE)) {
      await aplicar(queryRunner, codigo, anel);
    }
  }
}
