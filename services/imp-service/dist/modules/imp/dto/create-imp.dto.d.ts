import { ImpStatus } from '../../../domain/imp.entity';
export declare class CreateImpDto {
    readonly name: string;
    readonly description?: string;
    readonly status?: ImpStatus;
}
