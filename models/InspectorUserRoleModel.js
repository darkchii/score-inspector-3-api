const { DataTypes } = require("@sequelize/core");

const InspectorUserRoleModel = (db) => db.define('InspectorUserRole', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    osu_id: { type: DataTypes.INTEGER },
    role_id: { type: DataTypes.INTEGER },
    comment: { type: DataTypes.TEXT },
}, {
    tableName: 'inspector_user_roles',
    timestamps: false
});

module.exports = InspectorUserRoleModel;