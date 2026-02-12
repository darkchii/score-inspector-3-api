const express = require('express');
const { InspectorStat } = require('../helpers/db');
const { getFullUsers } = require('../helpers/userHelper');
const { OSU_SLUGS } = require('../helpers/osuHelper');
const router = express.Router();

const top_day_periods = ['today', 'yesterday', 'year', 'last_year'];
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

        const userIds = new Set();
        for (const period of top_day_periods) {
            if (!_new_data[period]) continue;
            for (const type in _new_data[period]) {
                for (const entry of _new_data[period][type]) {
                    userIds.add(entry.user_id);
                }
            }
        }

        console.log(`Found ${userIds.size} unique user IDs in top day stats.`);
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
                    'team_counts'
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
