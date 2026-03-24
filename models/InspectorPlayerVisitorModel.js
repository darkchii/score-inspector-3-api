const { DataTypes } = require("@sequelize/core");

const InspectorPlayerVisitorModel = (db) => db.define('InspectorPlayerVisitor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    target_id: { type: DataTypes.INTEGER, primaryKey: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    tableName: 'player_visitors',
    timestamps: false
});

module.exports = InspectorPlayerVisitorModel;