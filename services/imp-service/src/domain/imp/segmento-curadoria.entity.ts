/**
 * SegmentoCuradoria — registro de curadoria de um segmento de manuscrito.
 *
 * Tipo puro de domínio; sem decoradores Nest nem imports Prisma (RULE-01/02).
 */

export type SegmentoCuradoriaStatus = 'IGNORADO' | 'ATIVO';

export interface SegmentoCuradoriaProps {
  readonly id: string;
  readonly manuscritoId: string;
  readonly segmentoId: string;
  readonly status: SegmentoCuradoriaStatus;
  readonly motivo?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class SegmentoCuradoria {
  readonly id: string;
  readonly manuscritoId: string;
  readonly segmentoId: string;
  readonly status: SegmentoCuradoriaStatus;
  readonly motivo?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SegmentoCuradoriaProps) {
    this.id = props.id;
    this.manuscritoId = props.manuscritoId;
    this.segmentoId = props.segmentoId;
    this.status = props.status;
    this.motivo = props.motivo;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static ignore(
    manuscritoId: string,
    segmentoId: string,
    motivo?: string,
  ): SegmentoCuradoria {
    const now = new Date();
    return new SegmentoCuradoria({
      id: crypto.randomUUID(),
      manuscritoId,
      segmentoId,
      status: 'IGNORADO',
      motivo,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(
    manuscritoId: string,
    segmentoId: string,
  ): SegmentoCuradoria {
    const now = new Date();
    return new SegmentoCuradoria({
      id: crypto.randomUUID(),
      manuscritoId,
      segmentoId,
      status: 'ATIVO',
      createdAt: now,
      updatedAt: now,
    });
  }

  isIgnorado(): boolean {
    return this.status === 'IGNORADO';
  }
}
