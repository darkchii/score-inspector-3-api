const { DataTypes } = require("@sequelize/core");

const TeamModel = (db) => db.define('Team', {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    color: { type: DataTypes.STRING },
    youtube_id: { type: DataTypes.STRING },
    spotify_id: { type: DataTypes.STRING },
    discord_invite_id: { type: DataTypes.STRING },
    last_updated: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    tableName: 'teams',
    timestamps: false
});
module.exports.TeamModel = TeamModel;