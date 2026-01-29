const { DataTypes } = require("@sequelize/core");

const InspectorUserRoleModel = (db) => db.define('InspectorUserRole', {
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    role_id: { type: DataTypes.INTEGER, primaryKey: true },
    comment: { type: DataTypes.TEXT },
}, {
    tableName: 'player_roles',
    timestamps: false
});

module.exports = InspectorUserRoleModel;