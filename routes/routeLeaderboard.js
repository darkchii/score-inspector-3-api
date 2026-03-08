const express = require('express');
const { AltBeatmapLive, AltScoreLive, AltUserLive, Team, TeamStats, AltUserStat, getScoreRankModelByRuleset } = require('../helpers/db');
const { FetchDifficultyData, FetchDifficultyDetailed } = require('../helpers/diffCalcHelper');
const { OSU_SLUGS } = require('../helpers/osuHelper');
const { GetReplay } = require('../helpers/osuApiHelper');
const { getFullUsers } = require('../helpers/userHelper');
const { Op, default: Sequelize } = require('@sequelize/core');
const router = express.Router();

router.get('/score-rank/info/:ruleset', async (req, res) => {
    const { ruleset } = req.params;

    //validate ruleset, no 'all' allowed here
    if (!OSU_SLUGS.hasOwnProperty(ruleset)) {
        return res.status(400).json({ error: 'Invalid ruleset' });
    }

    try {
        const model = getScoreRankModelByRuleset(ruleset);
        if (!model) {
            return res.status(400).json({ error: 'Invalid ruleset' });
        }

        //find all unique dates in the table
        const data = await model.findAll({
            attributes: [
                [Sequelize.fn('DISTINCT', Sequelize.col('date')), 'date']
            ],
            order: [['date', 'DESC']]
        });

        const dates = data.map(d => d.date);

        res.json({
            dates: dates
        });
    } catch (err) {
        console.error('Error fetching score rank info:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

const SCORE_RANK_LIMIT = 50;
const SCORE_RANK_VALID_STATS = ['rank', 'gained_score', 'gained_rank'];
//gained stats need to compare with old_rank and old_ranked_score to calculate the gain
//gained_rank would be old_rank - rank, gained_score would be ranked_score - old_ranked_score
router.get('/score-rank/:ruleset/:stat/:date{/:page}', async (req, res) => {
    const { ruleset, stat, date, page } = req.params;

    //validate ruleset, no 'all' allowed here
    if (!OSU_SLUGS.hasOwnProperty(ruleset)) {
        return res.status(400).json({ error: 'Invalid ruleset' });
    }

    //validate stat
    if (!SCORE_RANK_VALID_STATS.includes(stat)) {
        return res.status(400).json({ error: 'Invalid stat, expected one of: ' + SCORE_RANK_VALID_STATS.join(', ') });
    }

    //date expected in YYYY-MM-DD format, validate it
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
    }

    try {
        const model = getScoreRankModelByRuleset(ruleset);
        if (!model) {
            return res.status(400).json({ error: 'Invalid ruleset' });
        }

        const pageNum = parseInt(page) || 1;
        const offset = (pageNum - 1) * SCORE_RANK_LIMIT;
        const data = await model.findAll({
            attributes: [
                'user_id',
                'username',
                'rank',
                'old_rank',
                'ranked_score',
                'old_ranked_score',
                //calculate gained stats on the fly using sequelize literal, nulls should be 0
                [Sequelize.literal(`COALESCE(rank, 0) - COALESCE(old_rank, rank, 0)`), 'gained_rank'],
                [Sequelize.literal(`COALESCE(ranked_score, 0) - COALESCE(old_ranked_score, ranked_score, 0)`), 'gained_score']
            ],
            where: { date: date },
            //nulls should always be last
            order: [[stat, stat === 'gained_score' ? 'DESC' : 'ASC']],
            limit: SCORE_RANK_LIMIT,
            offset: offset
        });

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No score rank entries found for this date' });
        }

        const userIds = data.map(d => d.user_id);
        const users = await getFullUsers(userIds, false);
        const userMap = {};
        users.forEach(u => {
            userMap[u.osuApi.id] = u;
        });

        const entries = data.map(entry => ({
            user: userMap[entry.user_id] || { id: entry.user_id, username: entry.username || 'Unknown' },
            rank: entry.rank,
            old_rank: entry.old_rank,
            ranked_score: entry.ranked_score,
            old_ranked_score: entry.old_ranked_score,
            gained_rank: entry.get('gained_rank'),
            gained_score: entry.get('gained_score')
        }));

        //add the data to the user objects themselves so the frontend can easily use it in itemlists
        entries.forEach(entry => {
            entry.user.score_rank = {
                rank: entry.rank,
                old_rank: entry.old_rank,
                ranked_score: entry.ranked_score,
                old_ranked_score: entry.old_ranked_score,
                //invert gained_rank
                gained_rank: -parseInt(entry.gained_rank, 10),
                gained_score: entry.gained_score
            };
        });

        const totalEntries = await model.count({ where: { date: date } });
        return res.json({
            date: date,
            page: pageNum,
            total_entries: totalEntries,
            total_pages: Math.ceil(totalEntries / SCORE_RANK_LIMIT),
            entries: entries
        });

    } catch (err) {
        console.error('Error fetching score rank:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

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

    if (country && !/^[a-zA-Z]{2}$/.test(country)) {
        return res.status(400).json({ error: 'Invalid country code' });
    }

    if (ruleset === 'all') {
        ruleset = 'total';
    }

    if (!OSU_SLUGS.hasOwnProperty(ruleset === 'all' ? 'total' : ruleset)) {
        return res.status(400).json({ error: 'Invalid ruleset' });
    }

    try {

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

        if (leaderboardDef.table === AltBeatmapLive) {
            if (ruleset_id === 4) {
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
        const innerOrderClause = `( ${selector} IS NULL ) ASC, ${selector} ${dir}`;
        const outerOrderClause = `( res_value IS NULL ) ASC, res_value ${dir}`;
        const diffExpression = dir === 'DESC' ? '(res_value - next_res_value)' : '(next_res_value - res_value)';
        let query_str = `WITH ranked AS (
            SELECT ${baseSelectors}${selector} AS res_value,
                LEAD(${selector}) OVER (ORDER BY ${innerOrderClause}) AS next_res_value
            FROM ${leaderboardDef.table.getTableName()}
            ${leaderboardDef.join ? leaderboardDef.join.map(j => `INNER JOIN ${j[0].getTableName()} ON ${leaderboardDef.table.getTableName()}.${j[1]} = ${j[0].getTableName()}.${j[2]}`).join(' ') : ''}
            WHERE 1=1 ${leaderboardDef.where ? 'AND ' + leaderboardDef.where.map(w => w.replaceAll('{ruleset}', ruleset).replaceAll('{ruleset_id}', ruleset_id)).join(' AND ') : ''}
            ${country_condition ? 'AND ' + country_condition : ''}
        )
            SELECT *,
                CASE
                    WHEN res_value IS NULL OR next_res_value IS NULL THEN NULL
                    ELSE ${diffExpression}
                END AS difference_value
            FROM ranked
            ORDER BY ${outerOrderClause}
            LIMIT :limit OFFSET :offset`;

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
            const userMap = {};
            users.forEach(u => {
                userMap[u.osuApi.id] = u;
            });

            //map data to include user info
            leaderboard = data.map(entry => {
                const user = userMap[parseInt(entry.user_id)];
                return {
                    user: user || { id: entry.user_id, username: entry.username || 'Unknown' },
                    value: entry.res_value,
                    difference_value: entry.difference_value
                };
            });
        } else if (leaderboardDef.table === AltBeatmapLive) {
            const beatmapIds = data.map(d => d.beatmap_id);
            const beatmaps = await AltBeatmapLive.findAll({
                where: { beatmap_id: { [Op.in]: beatmapIds } }
            });

            const beatmapMap = {};
            beatmaps.forEach(b => {
                beatmapMap[b.beatmap_id] = b;
            });

            leaderboard = data.map(entry => ({
                beatmap: beatmapMap[entry.beatmap_id] || entry,
                value: entry.res_value,
                difference_value: entry.difference_value
            }));
        } else if (leaderboardDef.table === Team) {
            const teamIds = data.map(d => d.id);
            const teams = await Team.findAll({
                where: { id: { [Op.in]: teamIds } },
                include: [TeamStats]
            });
            const teamMap = {};
            teams.forEach(t => {
                teamMap[t.id] = t;
            });
            leaderboard = data.map(entry => ({
                team: teamMap[entry.id] || entry,
                value: entry.res_value,
                difference_value: entry.difference_value
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
            entries: leaderboard
        });
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
})

module.exports = router;
