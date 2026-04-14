const express = require('express');
const { default: Sequelize } = require('@sequelize/core');
const { InspectorStat, Databases } = require('../helpers/db');
const { getFullUsers } = require('../helpers/userHelper');
const { OSU_SLUGS } = require('../helpers/osuHelper');
const router = express.Router();

const STAT_TYPE_CONFIGS = {
    clears: {
        select_clear: 'count(*)',
        primary_stats: ['legacy_total_score', 'classic_total_score'],
        included_attributes: [],
    },
    ss_clears: {
        select_clear: "sum(case when grade = 'XH' or grade = 'X' then 1 else 0 end)",
        primary_stats: ['legacy_total_score', 'classic_total_score'],
        included_attributes: ['grade'],
    },
    score: {
        select_clear: 'sum(case when legacy_total_score > 0 then legacy_total_score else classic_total_score end)',
        primary_stats: ['legacy_total_score', 'classic_total_score'],
        included_attributes: ['legacy_total_score', 'classic_total_score'],
    },
};

function getPeriodDates() {
    const now = new Date();
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
    const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1); lastMonth.setDate(1); lastMonth.setHours(0, 0, 0, 0);
    const thisYear = new Date(); thisYear.setMonth(0); thisYear.setDate(1); thisYear.setHours(0, 0, 0, 0);
    const lastYear = new Date(); lastYear.setFullYear(lastYear.getFullYear() - 1); lastYear.setMonth(0); lastYear.setDate(1); lastYear.setHours(0, 0, 0, 0);
    const lastYearEnd = new Date(); lastYearEnd.setFullYear(lastYearEnd.getFullYear() - 1); lastYearEnd.setMonth(11); lastYearEnd.setDate(31); lastYearEnd.setHours(23, 59, 59, 999);
    return {
        today: { start: today, end: null },
        yesterday: { start: yesterday, end: null },
        this_month: { start: thisMonth, end: now },
        last_month: { start: lastMonth, end: thisMonth },
        year: { start: thisYear, end: now },
        last_year: { start: lastYear, end: lastYearEnd },
    };
}

async function queryUserPosition(ruleset_id, date_start, date_end, select_clear, primary_stats, included_attributes, user_id) {
    const start = new Date(date_start);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(date_end || date_start);
    end.setUTCHours(23, 59, 59, 999);
    const ruleset_query = ruleset_id < 4 ? `AND ruleset_id = ${ruleset_id}` : '';
    const attrs_select = included_attributes.length > 0 ? `${included_attributes.join(', ')},` : '';
    const attrs_select_trailing = included_attributes.length > 0 ? `, ${included_attributes.join(', ')}` : '';
    const primary_stat_expr = primary_stats.length > 0
        ? `, GREATEST(${primary_stats.map(s => `NULLIF(${s}, 0)`).join(', ')}) as primary_stat`
        : '';

    // Query 1: get the user's value (single-user scoped — only scans this user's rows)
    const userValueQuery = `
        WITH normalized_scores AS (
            SELECT beatmap_id_fk, ${attrs_select} ended_at${primary_stat_expr}
            FROM scorelive
            WHERE user_id_fk = :user_id ${ruleset_query} AND ended_at <= :end
        ),
        best_scores AS (
            SELECT DISTINCT ON (beatmap_id_fk)
                beatmap_id_fk, ended_at${attrs_select_trailing}, primary_stat
            FROM normalized_scores
            WHERE primary_stat IS NOT NULL
            ORDER BY beatmap_id_fk, primary_stat DESC, ended_at DESC
        ),
        today_best_scores AS (
            SELECT beatmap_id_fk${attrs_select_trailing}
            FROM best_scores
            WHERE ended_at BETWEEN :start AND :end
        )
        SELECT ${select_clear} as clear
        FROM today_best_scores;
    `;

    const [valueRow] = await Databases.osuAlt.query(userValueQuery, {
        replacements: { start, end, user_id },
        type: Sequelize.QueryTypes.SELECT,
    });

    const userClear = (valueRow && valueRow.clear !== null) ? parseInt(valueRow.clear) : 0;

    // Query 2: total (non-unique, all submissions in window)
    const [totalRow] = await Databases.osuAlt.query(
        `SELECT ${select_clear} as clear FROM scorelive
         WHERE 1=1 ${ruleset_query} AND ended_at BETWEEN :start AND :end AND user_id_fk = :user_id`,
        { replacements: { start, end, user_id }, type: Sequelize.QueryTypes.SELECT }
    );

    return {
        user_id,
        clear: Number.isNaN(userClear) ? 0 : userClear,
        total: (totalRow && totalRow.clear !== null && !Number.isNaN(parseInt(totalRow.clear))) ? parseInt(totalRow.clear) : 0,
        is_self: true,
    };
}

const top_day_periods = ['today', 'yesterday', 'this_month', 'last_month', 'year', 'last_year'];
router.get('/top-day/:ruleset', async (req, res) => {
    const { ruleset } = req.params;
    let _ruleset = ruleset;
    //if ruleset is 'all', replace with 'total'
    if (ruleset === 'all') {
        _ruleset = 'total';
    }
    // Today's top plays (most cleared today, most ss'ed today, etc.)
    try {
        const data = await InspectorStat.findOne({ where: { metric: 'today_top_players' } });

        if (!data || !data.data) {
            throw new Error('No data found');
        }

        const last_updated = data.last_updated;
        const _data = JSON.parse(data.data);

        const _new_data = {}; //will have same structure as _data, except for separate rulesets
        //ie: _data[period][ruleset_id][type] => _new_data[period][type] 

        for (const period of top_day_periods) {
            if (!_data[period]) continue;
            _new_data[period] = {};

            if (_data[period][`ruleset_${OSU_SLUGS[_ruleset]}`]) {
                const _ruleset_data = _data[period][`ruleset_${OSU_SLUGS[_ruleset]}`];
                for (const type in _ruleset_data) {
                    _new_data[period][type] = _ruleset_data[type];
                }
            }
        }

        const selfUserId = req.query.user_id ? parseInt(req.query.user_id, 10) : null;
        if (selfUserId && Number.isInteger(selfUserId) && selfUserId > 0) {
            const periodDates = getPeriodDates();
            const rulesetId = OSU_SLUGS[_ruleset];
            const selfTasks = [];
            for (const period of top_day_periods) {
                if (!_new_data[period]) continue;
                for (const type of Object.keys(STAT_TYPE_CONFIGS)) {
                    if (!_new_data[period][type]) continue;
                    if (_new_data[period][type].some(e => e.user_id === selfUserId)) continue;
                    const config = STAT_TYPE_CONFIGS[type];
                    const { start, end } = periodDates[period];
                    selfTasks.push(
                        queryUserPosition(
                            rulesetId, start, end,
                            config.select_clear, config.primary_stats, config.included_attributes,
                            selfUserId
                        ).then(selfEntry => {
                            if (selfEntry) _new_data[period][type].push(selfEntry);
                        })
                    );
                }
            }
            await Promise.all(selfTasks);
        }

        const userIds = new Set();
        for (const period of top_day_periods) {
            if (!_new_data[period]) continue;
            for (const type in _new_data[period]) {
                for (const entry of _new_data[period][type]) {
                    userIds.add(entry.user_id);
                }
            }
        }

        const userIdArray = Array.from(userIds);

        const userData = await getFullUsers(userIdArray);
        const userDataMap = {};
        for (const user of userData) {
            userDataMap[user.osuApi?.id || user.osuAlternative?.user_id] = user;
        }

        //attach user data
        for (const period of top_day_periods) {
            if (!_new_data[period]) continue;
            for (const type in _new_data[period]) {
                for (const entry of _new_data[period][type]) {
                    entry.user = userDataMap[entry.user_id] || null;
                }
            }
        }

        res.json({
            data: _new_data,
            last_updated
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/global-stats', async (req, res) => {
    try {
        //get: beatmap_counts, score_counts, user_counts, team_counts
        const data = await InspectorStat.findAll({
            where: {
                metric: [
                    'beatmap_counts',
                    'score_counts',
                    'user_counts',
                    'team_counts',
                    'reputation_counts'
                ]
            }
        })

        const result = {};
        data.forEach(stat => {
            if (stat.data) {
                result[stat.metric] = {
                    data: JSON.parse(stat.data),
                    last_updated: stat.last_updated
                };
            }
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/score-submissions/:ruleset', async (req, res) => {
    const { ruleset } = req.params;
    let _ruleset = ruleset;
    if (ruleset === 'all') {
        _ruleset = 'total';
    }
    try {
        if (!Object.keys(OSU_SLUGS).includes(_ruleset)) {
            return res.status(400).json({ error: 'Invalid ruleset' });
        }

        const ruleset_id = OSU_SLUGS[_ruleset];
        const data = await InspectorStat.findOne({ where: { metric: `score_data_counts_ruleset_${ruleset_id}` } });
        if (!data || !data.data) {
            return res.status(404).json({ error: 'No data found' });
        }

        res.json({
            data: JSON.parse(data.data),
            last_updated: data.last_updated
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/active-users', async (req, res) => {
    try {
        const data = await InspectorStat.findOne({ where: { metric: 'active_users' } });
        if (!data || !data.data) {
            return res.status(404).json({ error: 'No data found' });
        }
        res.json({
            data: JSON.parse(data.data),
            last_updated: data.last_updated
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
