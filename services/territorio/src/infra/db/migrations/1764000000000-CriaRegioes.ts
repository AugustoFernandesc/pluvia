import { MigrationInterface, QueryRunner } from 'typeorm';

// Pilot regions of Lavras/MG. The boundaries are a coarse grid around the city
// center, not official neighborhood limits. The ids are fixed so other services
// (Risco, Análise, seeds and demos) can reference the same regions.
const REGIOES = [
  {
    id: '6f1c2a10-0000-4000-8000-000000000001',
    codigo: 'LAV-CENTRO',
    nome: 'Centro',
    poligono: '-45.005 -21.250, -44.995 -21.250, -44.995 -21.240, -45.005 -21.240, -45.005 -21.250',
    curso: true,
    declividade: 6,
    ocupacao: 'COMERCIAL',
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000002',
    codigo: 'LAV-NORTE',
    nome: 'Zona Norte',
    poligono: '-45.005 -21.240, -44.995 -21.240, -44.995 -21.225, -45.005 -21.225, -45.005 -21.240',
    curso: false,
    declividade: 12,
    ocupacao: 'RESIDENCIAL',
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000003',
    codigo: 'LAV-SUL',
    nome: 'Zona Sul',
    poligono: '-45.005 -21.265, -44.995 -21.265, -44.995 -21.250, -45.005 -21.250, -45.005 -21.265',
    curso: true,
    declividade: 3,
    ocupacao: 'RESIDENCIAL',
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000004',
    codigo: 'LAV-LESTE',
    nome: 'Zona Leste',
    poligono: '-44.995 -21.265, -44.975 -21.265, -44.975 -21.225, -44.995 -21.225, -44.995 -21.265',
    curso: false,
    declividade: 9,
    ocupacao: 'MISTA',
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000005',
    codigo: 'LAV-OESTE',
    nome: 'Zona Oeste',
    poligono: '-45.025 -21.265, -45.005 -21.265, -45.005 -21.225, -45.025 -21.225, -45.025 -21.265',
    curso: true,
    declividade: 4,
    ocupacao: 'INDUSTRIAL',
  },
];

export class CriaRegioes1764000000000 implements MigrationInterface {
  name = 'CriaRegioes1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await queryRunner.query(`
      CREATE TABLE regioes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo text NOT NULL UNIQUE,
        nome text NOT NULL,
        municipio text NOT NULL,
        uf char(2) NOT NULL,
        geometria geometry(MultiPolygon, 4326) NOT NULL,
        caracteristicas jsonb,
        criada_em timestamptz NOT NULL DEFAULT now(),
        atualizada_em timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      'CREATE INDEX regioes_geometria_idx ON regioes USING gist (geometria)',
    );

    for (const r of REGIOES) {
      await queryRunner.query(
        `INSERT INTO regioes (id, codigo, nome, municipio, uf, geometria, caracteristicas)
         SELECT $1, $2, $3, 'Lavras', 'MG', g,
                jsonb_build_object(
                  'areaKm2', round((ST_Area(g::geography) / 1e6)::numeric, 2),
                  'proximidadeCursoAgua', $5::boolean,
                  'declividadeMediaPct', $6::numeric,
                  'tipoOcupacao', $7::text)
         FROM (SELECT ST_Multi(ST_GeomFromText($4, 4326)) AS g) AS geo`,
        [r.id, r.codigo, r.nome, `POLYGON((${r.poligono}))`, r.curso, r.declividade, r.ocupacao],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE regioes');
  }
}
