import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class InitPackingModules1712500000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
