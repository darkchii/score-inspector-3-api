const { DataTypes } = require("@sequelize/core");

const InspectorPlayerReputationModel = (db) => db.define('InspectorPlayerReputation', {
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    target_id: { type: DataTypes.INTEGER, primaryKey: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    tableName: 'player_reputation',
    timestamps: false
});

module.exports = InspectorPlayerReputationModel;