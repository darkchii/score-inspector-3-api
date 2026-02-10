const { default: Sequelize } = require('@sequelize/core');
const { MariaDbDialect } = require('@sequelize/mariadb');
const { PostgresDialect } = require('@sequelize/postgres');
const AltUserLiveModel = require('../models/AltUserLiveModel');
const AltBeatmapLiveModel = require('../models/AltBeatmapLiveModel');
const AltScoreLiveModel = require('../models/AltScoreLiveModel');
const TeamModel = require('../models/TeamModel');
const AltRegistrationModel = require('../models/AltRegistrationModel');
const InspectorCompletionistModel = require('../models/InspectorCompletionistModel');
const InspectorRoleModel = require('../models/InspectorRoleModel');
const InspectorUserRoleModel = require('../models/InspectorUserRoleModel');
const AltBeatmapPackModel = require('../models/AltBeatmapPackModel');
const AltUserStatModel = require('../models/AltUserStatModel');
const TeamMemberModel = require('../models/TeamMemberModel');
const TeamStatsModel = require('../models/TeamStatsModel');
const { InspectorStatModel } = require('../models/InspectorStatModel');
const InspectorPlayerReputationModel = require('../models/InspectorPlayerReputationModel');
require('dotenv').config();

let databases = {
    inspector: new Sequelize(
        {
            dialect: MariaDbDialect,
            database: process.env.MYSQL_DB,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASS,
            host: process.env.MYSQL_HOST,
            timezone: 'Europe/Amsterdam',
            logging: false,
            retry: {
                max: 10
            }
        }
    ),
    inspector_teams: new Sequelize(
        {
            dialect: MariaDbDialect,
            database: process.env.MYSQL_DB_TEAM,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASS,
            host: process.env.MYSQL_HOST,
            timezone: 'Europe/Amsterdam',
            logging: false,
            retry: {
                max: 10
            }
        }
    ),
    osuAlt: new Sequelize(
        {
            dialect: PostgresDialect,
            database: process.env.ALT_DB_DATABASE,
            user: process.env.ALT_DB_USER,
            password: process.env.ALT_DB_PASSWORD,
            host: process.env.ALT_DB_HOST,
            port: process.env.ALT_DB_PORT,
            logging: false,
            retry: {
                max: 10
            }
        }
    )
};
module.exports.Databases = databases;

async function CheckConnection(database, timeout = 10000) {
    //just race between database.authenticate and a timeout
    let success = false;

    await Promise.race([
        database.authenticate().then(() => {
            success = true;
        }),
        new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, timeout);
        })
    ]);

    if (!success) {
        throw new Error('Connection failed');
    }

    return success;
}

const AltUserLive = AltUserLiveModel(databases.osuAlt);
const AltUserStat = AltUserStatModel(databases.osuAlt);
const AltBeatmapLive = AltBeatmapLiveModel(databases.osuAlt);
const AltBeatmapPack = AltBeatmapPackModel(databases.osuAlt);
const AltScoreLive = AltScoreLiveModel(databases.osuAlt);
const AltRegistration = AltRegistrationModel(databases.osuAlt);

const InspectorCompletionist = InspectorCompletionistModel(databases.inspector);
const InspectorRole = InspectorRoleModel(databases.inspector);
const InspectorUserRole = InspectorUserRoleModel(databases.inspector);

const InspectorStat = InspectorStatModel(databases.inspector);

const InspectorPlayerReputation = InspectorPlayerReputationModel(databases.inspector);

const Team = TeamModel(databases.inspector_teams);
const TeamMember = TeamMemberModel(databases.inspector_teams);
const TeamStats = TeamStatsModel(databases.inspector_teams);

InspectorUserRole.hasOne(InspectorRole, { foreignKey: 'id', sourceKey: 'role_id' });

AltUserLive.hasMany(AltScoreLive, { foreignKey: 'user_id_fk', sourceKey: 'user_id' });
AltUserLive.hasMany(AltUserStat, { foreignKey: 'user_id', sourceKey: 'user_id' });
AltScoreLive.belongsTo(AltUserLive, { foreignKey: 'user_id_fk', targetKey: 'user_id' });
AltUserStat.belongsTo(AltUserLive, { foreignKey: 'user_id', targetKey: 'user_id' });

TeamMember.belongsTo(Team, { foreignKey: 'team_id', targetKey: 'id' });
Team.hasMany(TeamMember, { foreignKey: 'team_id', sourceKey: 'id' });

TeamStats.belongsTo(Team, { foreignKey: 'id', targetKey: 'id' });
Team.hasMany(TeamStats, { foreignKey: 'id', sourceKey: 'id' });

module.exports.CheckConnection = CheckConnection;
module.exports.AltUserLive = AltUserLive;
module.exports.AltBeatmapLive = AltBeatmapLive;
module.exports.AltBeatmapPack = AltBeatmapPack;
module.exports.AltScoreLive = AltScoreLive;
module.exports.AltRegistration = AltRegistration;

module.exports.InspectorCompletionist = InspectorCompletionist;
module.exports.InspectorRole = InspectorRole;
module.exports.InspectorUserRole = InspectorUserRole;

module.exports.InspectorStat = InspectorStat;

module.exports.InspectorPlayerReputation = InspectorPlayerReputation;

module.exports.Team = Team;
module.exports.TeamMember = TeamMember;
module.exports.TeamStats = TeamStats;
