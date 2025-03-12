import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
    up: async (queryInterface: QueryInterface) => {
        await queryInterface.createTable('artifacts', {
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
            },
            createdAt: {
                type: DataTypes.DATE,
                allowNull: false
            },
            updatedAt: {
                type: DataTypes.DATE,
                allowNull: false
            }
        });
    },

    down: async (queryInterface: QueryInterface) => {
        await queryInterface.dropTable('artifacts');
    }
};
