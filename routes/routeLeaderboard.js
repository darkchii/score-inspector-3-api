const express = require('express');
const { AltBeatmapLive, AltScoreLive, AltUserLive, Team, TeamStats, AltUserStat } = require('../helpers/db');
const { FetchDifficultyData, FetchDifficultyDetailed } = require('../helpers/diffCalcHelper');
const { OSU_SLUGS } = require('../helpers/osuHelper');
const { GetReplay } = require('../helpers/osuApiHelper');
const { getFullUsers } = require('../helpers/userHelper');
const { Op, default: Sequelize } = require('@sequelize/core');
const router = express.Router();

const LEADERBOARDS = {
    'pp': {
        selector: '{ruleset}_pp',
        table: AltUserLive,
    },
    'ranked_score': {
        selector: '{ruleset}_ranked_score',
        table: AltUserLive,
    },
    'total_score': {
        selector: '{ruleset}_total_score',
        table: AltUserLive
    },
    'total_scores_count': {
        selector: '(COALESCE({ruleset}_grade_counts_ssh, 0) + COALESCE({ruleset}_grade_counts_ss, 0) + COALESCE({ruleset}_grade_counts_sh, 0) + COALESCE({ruleset}_grade_counts_s, 0) + COALESCE({ruleset}_grade_counts_a, 0) + COALESCE({ruleset}_grade_counts_b, 0) + COALESCE({ruleset}_grade_counts_c, 0) + COALESCE({ruleset}_grade_counts_d, 0))',
        table: AltUserLive,
    },
    'grade_counts_total_ss': {
        selector: '(COALESCE({ruleset}_grade_counts_ssh, 0) + COALESCE({ruleset}_grade_counts_ss, 0))',
        table: AltUserLive
    },
    'grade_counts_ssh': {
        selector: '{ruleset}_grade_counts_ssh',
        table: AltUserLive
    },
    'grade_counts_ss': {
        selector: '{ruleset}_grade_counts_ss',
        table: AltUserLive
    },
    'grade_counts_total_s': {
        selector: '(COALESCE({ruleset}_grade_counts_sh, 0) + COALESCE({ruleset}_grade_counts_s, 0))',
        table: AltUserLive
    },
    'grade_counts_sh': {
        selector: '{ruleset}_grade_counts_sh',
        table: AltUserLive
    },
    'grade_counts_s': {
        selector: '{ruleset}_grade_counts_s',
        table: AltUserLive
    },
    'grade_counts_a': {
        selector: '{ruleset}_grade_counts_a',
        table: AltUserLive
    },
    'grade_counts_b': {
        selector: '{ruleset}_grade_counts_b',
        table: AltUserLive
    },
    'grade_counts_c': {
        selector: '{ruleset}_grade_counts_c',
        table: AltUserLive
    },
    'grade_counts_d': {
        selector: '{ruleset}_grade_counts_d',
        table: AltUserLive
    },
    'replays_watched_by_others': {
        selector: '{ruleset}_replays_watched_by_others',
        table: AltUserLive
    },
    'play_time': {
        selector: '{ruleset}_play_time',
        table: AltUserLive
    },
    'play_count': {
        selector: '{ruleset}_play_count',
        table: AltUserLive
    },
    'team_play_count': {
        selector: 'osu_teams_ruleset.play_count',
        table: Team,
        ruleset_is_index: true,
        where: [`mode = {ruleset}`],
        join: [[TeamStats, 'id', 'id']]
    },
    'completion': {
        table: AltUserStat,
        //bit more complex, need so select
        selector: '(100.0 * value / total)',
        ruleset_is_index: true,
        where: ['mode_bucket = {ruleset_id} and fa_bucket = 2 and diff_bucket = 2 and metric_type = \'plays\''],
        join: [[AltUserLive, 'user_id', 'user_id']]
    },
    'beatmap_play_count': {
        table: AltBeatmapLive,
        selector: 'play_count',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_pass_count': {
        table: AltBeatmapLive,
        selector: 'pass_count',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_favourite_count': {
        table: AltBeatmapLive,
        selector: 'favourite_count',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_rating': {
        table: AltBeatmapLive,
        selector: 'rating',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_length': {
        table: AltBeatmapLive,
        selector: 'length',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_rank_date': {
        table: AltBeatmapLive,
        selector: 'ranked_date',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_rank_duration': {
        table: AltBeatmapLive,
        //selector: difference between ranked_date and submitted_date (absolute value)
        selector: 'ABS(EXTRACT(EPOCH FROM (ranked_date - submitted_date)))', //rank duration in seconds
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_circles': {
        table: AltBeatmapLive,
        selector: 'count_circles',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_sliders': {
        table: AltBeatmapLive,
        selector: 'count_sliders',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_spinners': {
        table: AltBeatmapLive,
        selector: 'count_spinners',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_objects': {
        table: AltBeatmapLive,
        selector: '(count_circles + count_sliders + count_spinners)',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    },
    'beatmap_difficulty': {
        table: AltBeatmapLive,
        selector: 'stars',
        ruleset_is_index: true,
        where: ['mode in ({ruleset_id})'],
    }
}

const DEFAULT_LEADERBOARD_LIMIT = 50;
router.all('/:ruleset/:stat/:page{/:dir}{/:limit}{/:country}', async (req, res) => {
    let { ruleset, stat, page, dir, limit, country } = req.params;

    if(country && !/^[a-zA-Z]{2}$/.test(country)) {
        return res.status(400).json({ error: 'Invalid country code' });
    }

    try {
        if (ruleset === 'all') {
            ruleset = 'total';
        }

        let ruleset_id = OSU_SLUGS[ruleset];
        
        page = parseInt(page) || 1;
        dir = dir === 'asc' ? 'ASC' : 'DESC';
        limit = parseInt(limit) || DEFAULT_LEADERBOARD_LIMIT;
        limit = Math.min(limit, 100); //max 100 entries per page
        const offset = (page - 1) * limit;

        const leaderboardDef = LEADERBOARDS[stat];
        if (!leaderboardDef) {
            return res.status(400).json({ error: 'Invalid leaderboard stat' });
        }

        if(leaderboardDef.table === AltBeatmapLive){
            if(ruleset_id === 4){
                ruleset_id = '0,1,2,3';
            }
        }

        if (leaderboardDef.ruleset_is_index) {
            const rulesetIndex = OSU_SLUGS[ruleset];
            if (rulesetIndex === -1) {
                return res.status(400).json({ error: 'Invalid ruleset' });
            }
            ruleset = rulesetIndex;
        }

        let selector = leaderboardDef.selector.replaceAll('{ruleset}', ruleset);

        let baseSelectors = '';
        if (leaderboardDef.table === AltUserLive) {
            baseSelectors = 'user_id, username, ';
        } else if (leaderboardDef.table === AltUserStat) {
            baseSelectors = 'userstats.user_id, ';
        } else if (leaderboardDef.table === AltBeatmapLive) {
            baseSelectors = 'beatmap_id, title, artist, mapper, ';
        } else if (leaderboardDef.table === Team) {
            baseSelectors = 'osu_teams.id, name, tag, ';
        }

        let country_condition = '';
        if (country && leaderboardDef.table !== AltBeatmapLive) {
            country_condition = `${leaderboardDef.country_column || 'country_code'} ILIKE '${country}'`;
        }
        let query_str = `SELECT ${baseSelectors}${selector} AS res_value
            FROM ${leaderboardDef.table.getTableName()}
            ${leaderboardDef.join ? leaderboardDef.join.map(j => `INNER JOIN ${j[0].getTableName()} ON ${leaderboardDef.table.getTableName()}.${j[1]} = ${j[0].getTableName()}.${j[2]}`).join(' ') : ''}
            WHERE 1=1 ${leaderboardDef.where ? 'AND ' + leaderboardDef.where.map(w => w.replaceAll('{ruleset}', ruleset).replaceAll('{ruleset_id}', ruleset_id)).join(' AND ') : ''}
            ${country_condition ? 'AND ' + country_condition : ''}
            ORDER BY ( ${selector} IS NULL ) ASC, ${selector} ${dir}
            LIMIT :limit OFFSET :offset`;

        console.log(query_str.replaceAll(':limit', limit).replaceAll(':offset', offset));

        //raw query instead, the above seems bugged in sequelize v7
        const data = await leaderboardDef.table.sequelize.query(query_str,
            {
                replacements: { limit: limit, offset: offset },
                type: Sequelize.QueryTypes.SELECT
            }
        );

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No leaderboard entries found' });
        }

        let leaderboard = [];
        if (leaderboardDef.table === AltUserLive || leaderboardDef.table === AltUserStat) {
            const users = await getFullUsers(data.map(d => d.user_id), false);

            //map data to include user info
            leaderboard = data.map(entry => {
                const user = users.find(u => u.osuApi.id === parseInt(entry.user_id));
                return {
                    user: user || { id: entry.user_id, username: entry.username || 'Unknown' },
                    value: entry.res_value
                };
            });
        }else if (leaderboardDef.table === AltBeatmapLive) {
            const beatmapIds = data.map(d => d.beatmap_id);
            const beatmaps = await AltBeatmapLive.findAll({
                where: { beatmap_id: { [Op.in]: beatmapIds } }
            });

            leaderboard = data.map(entry => ({
                beatmap: beatmaps.find(b => b.beatmap_id === entry.beatmap_id) || entry,
                value: entry.res_value
            }));
            // leaderboard = data.map(entry => ({
            //     beatmap: entry,
            //     value: entry.res_value
            // }));
        }else if (leaderboardDef.table === Team) {
            const teamIds = data.map(d => d.id);
            const teams = await Team.findAll({
                where: { id: { [Op.in]: teamIds } },
                include: [TeamStats]
            });
            leaderboard = data.map(entry => ({
                team: teams.find(t => t.id === entry.id) || entry,
                value: entry.res_value
            }));
        }

        const countTotal = await leaderboardDef.table.sequelize.query(
            `SELECT COUNT(*) AS count
            FROM ${leaderboardDef.table.getTableName()}
            ${leaderboardDef.join ? leaderboardDef.join.map(j => `INNER JOIN ${j[0].getTableName()} ON ${leaderboardDef.table.getTableName()}.${j[1]} = ${j[0].getTableName()}.${j[2]}`).join(' ') : ''}
            WHERE 1=1 ${leaderboardDef.where ? 'AND ' + leaderboardDef.where.map(w => w.replaceAll('{ruleset}', ruleset).replaceAll('{ruleset_id}', ruleset_id)).join(' AND ') : ''}
            ${country_condition ? 'AND ' + country_condition : ''}
            `,
            {
                type: Sequelize.QueryTypes.SELECT
            }
        ).then(result => result[0].count);

        return res.status(200).json({
            page: page,
            limit: limit,
            total_entries: countTotal,
            total_pages: Math.ceil(countTotal / limit),
            entries: leaderboard,
            query: query_str
        });
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
})

module.exports = router;
