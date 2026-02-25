const { DataTypes } = require("@sequelize/core");

const InspectorScoreRankModel = (db, table) => db.define('ScoreRank', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    date: { type: DataTypes.DATE, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    rank: { type: DataTypes.INTEGER, allowNull: false },
    old_rank: { type: DataTypes.INTEGER, allowNull: true },
    ranked_score: { type: DataTypes.BIGINT, allowNull: false },
    old_ranked_score: { type: DataTypes.BIGINT, allowNull: true },
    username: { type: DataTypes.STRING, allowNull: false }
}, {
    tableName: table,
    timestamps: false
});
module.exports.InspectorScoreRankModel = InspectorScoreRankModel;