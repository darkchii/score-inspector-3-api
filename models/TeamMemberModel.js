const { DataTypes } = require("@sequelize/core");

const TeamMemberModel = (db) => db.define('TeamMember', {
    team_id: { type: DataTypes.INTEGER, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    is_leader: { type: DataTypes.BOOLEAN },
}, {
    tableName: 'osu_teams_members',
    timestamps: false
});

module.exports = TeamMemberModel;