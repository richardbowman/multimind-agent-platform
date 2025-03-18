import { DataTypes, Model, Optional } from 'sequelize';
import { UUID } from '../types/uuid';
import { ArtifactType } from './artifact';

interface ArtifactAttributes {
  id: UUID;
  type: ArtifactType;
  contentPath: string;
  version: number;
  tokenCount?: number;
  mimeType?: string;
  subtype?: string;
  metadata?: ArtifactMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ArtifactMetadata extends Record<string, any> {
  summary?: string;
}

interface ArtifactCreationAttributes extends Optional<ArtifactAttributes, 'id'> {}

export class ArtifactModel extends Model<ArtifactAttributes, ArtifactCreationAttributes> 
  implements ArtifactAttributes {
  public id!: UUID;
  public type!: ArtifactType;
  public contentPath!: string;
  public version!: number;
  public tokenCount?: number;
  public mimeType?: string;
  public subtype?: string;
  public metadata?: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static initialize(sequelize: any) {
    this.init({
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false
      },
      contentPath: {
        type: DataTypes.STRING,
        allowNull: false
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      tokenCount: {
        type: DataTypes.INTEGER
      },
      mimeType: {
        type: DataTypes.STRING
      },
      subtype: {
        type: DataTypes.STRING
      },
      metadata: {
        type: DataTypes.JSON
      }
    }, {
      sequelize,
      tableName: 'artifacts',
      timestamps: true
    });
  }
}
