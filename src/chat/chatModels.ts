import { DataTypes, Model, Optional } from 'sequelize';
import { UUID } from '../types/uuid';
import { ChatHandle } from '../types/chatHandle';

interface ChatPostAttributes {
  id: UUID;
  channel_id: UUID;
  message: string;
  user_id: UUID;
  props: Record<string, any>;
  create_at: number;
  update_at?: number;
  directed_at?: string;
  thread_id?: UUID;
  attachments?: Record<string, any>[];
}

interface ChatPostCreationAttributes extends Optional<ChatPostAttributes, 'id'> {}

export class ChatPostModel extends Model<ChatPostAttributes, ChatPostCreationAttributes> 
  implements ChatPostAttributes {
  public id!: UUID;
  public channel_id!: UUID;
  public message!: string;
  public user_id!: UUID;
  public props!: Record<string, any>;
  public create_at!: number;
  public update_at?: number;
  public directed_at?: string;
  public thread_id?: UUID;
  public attachments?: Record<string, any>[];

  public static initialize(sequelize: any) {
    this.init({
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      channel_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      props: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
      },
      create_at: {
        type: DataTypes.BIGINT,
        allowNull: false
      },
      update_at: {
        type: DataTypes.BIGINT
      },
      directed_at: {
        type: DataTypes.STRING
      },
      thread_id: {
        type: DataTypes.UUID
      },
      attachments: {
        type: DataTypes.JSON
      }
    }, {
      sequelize,
      tableName: 'chat_posts',
      timestamps: false
    });
  }
}

interface ChannelDataAttributes {
  id: UUID;
  name: string;
  description?: string;
  isPrivate?: boolean;
  members?: UUID[];
  defaultResponderId?: UUID;
  projectId?: UUID;
  goalTemplate?: string;
  artifactIds?: UUID[];
}

export class ChannelDataModel extends Model<ChannelDataAttributes> 
  implements ChannelDataAttributes {
  public id!: UUID;
  public name!: string;
  public description?: string;
  public isPrivate?: boolean;
  public members?: UUID[];
  public defaultResponderId?: UUID;
  public projectId?: UUID;
  public goalTemplate?: string;
  public artifactIds?: UUID[];

  public static initialize(sequelize: any) {
    this.init({
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT
      },
      isPrivate: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      members: {
        type: DataTypes.JSON,
        get() {
          const rawValue = this.getDataValue('members');
          return rawValue ? JSON.parse(rawValue) : [];
        },
        set(value: UUID[]) {
          this.setDataValue('members', JSON.stringify(value));
        }
      },
      defaultResponderId: {
        type: DataTypes.UUID
      },
      projectId: {
        type: DataTypes.UUID
      },
      goalTemplate: {
        type: DataTypes.STRING
      },
      artifactIds: {
        type: DataTypes.ARRAY(DataTypes.UUID)
      }
    }, {
      sequelize,
      tableName: 'channels',
      timestamps: false
    });
  }
}

interface UserHandleAttributes {
  user_id: UUID;
  handle: ChatHandle;
}

export class UserHandleModel extends Model<UserHandleAttributes> 
  implements UserHandleAttributes {
  public user_id!: UUID;
  public handle!: ChatHandle;

  public static initialize(sequelize: any) {
    this.init({
      user_id: {
        type: DataTypes.UUID,
        primaryKey: true
      },
      handle: {
        type: DataTypes.STRING,
        allowNull: false
      }
    }, {
      sequelize,
      tableName: 'user_handles',
      timestamps: false
    });
  }
}
