const { DataTypes } = require("@sequelize/core");

const TeamStatsModel = (db) => db.define('TeamStats', {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    mode: { type: DataTypes.INTEGER, primaryKey: true },
    play_count: { type: DataTypes.INTEGER },
    ranked_score: { type: DataTypes.BIGINT },
    average_score: { type: DataTypes.INTEGER },
    performance: { type: DataTypes.INTEGER },
    clears: { type: DataTypes.INTEGER },
    total_ss: { type: DataTypes.INTEGER },
    total_s: { type: DataTypes.INTEGER },
    total_a: { type: DataTypes.INTEGER },
    total_score: { type: DataTypes.BIGINT },
    play_time: { type: DataTypes.BIGINT },
    total_hits: { type: DataTypes.BIGINT },
    replays_watched: { type: DataTypes.BIGINT },
}, {
    tableName: 'osu_teams_ruleset',
    timestamps: false
});

module.exports = TeamStatsModel;