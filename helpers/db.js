const { default: Sequelize } = require('@sequelize/core');
const { MariaDbDialect } = require('@sequelize/mariadb');
const { PostgresDialect } = require('@sequelize/postgres');
const AltUserLiveModel = require('../models/AltUserLive');
const AltBeatmapLiveModel = require('../models/AltBeatmapLive');
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
const AltBeatmapLive = AltBeatmapLiveModel(databases.osuAlt);

module.exports.CheckConnection = CheckConnection;
module.exports.AltUserLive = AltUserLive;
module.exports.AltBeatmapLive = AltBeatmapLive;